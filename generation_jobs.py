"""Local background generation with private, bounded result retention."""
import copy
import hashlib
import json
import re
import threading
import time
from pathlib import Path


class GenerationJobs:
    def __init__(self, directory, retention=86400, capacity=100, workers=2):
        self.directory = Path(directory)
        self.retention, self.capacity = retention, capacity
        self.lock = threading.Lock()
        self.slots = threading.Semaphore(workers)
        self.jobs = None

    @staticmethod
    def valid_id(value):
        return isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{32,80}', value) is not None

    @staticmethod
    def fingerprint(body):
        return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def _save(self, job):
        target = self.directory / (job['id'] + '.json')
        temporary = target.with_suffix('.tmp')
        temporary.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
        temporary.replace(target)

    def _load(self):
        if self.jobs is not None:
            return
        self.directory.mkdir(parents=True, exist_ok=True)
        self.jobs = {}
        for file in self.directory.glob('*.json'):
            if not self.valid_id(file.stem):
                continue
            try:
                job = json.loads(file.read_text(encoding='utf-8'))
                if job['id'] != file.stem:
                    continue
                if time.time() - job['updated_at'] > self.retention:
                    file.unlink()
                    continue
                if job['status'] in ('queued', 'running'):
                    job.update(status='failed', error='主机服务已重启，未完成的任务已中止。请手动重新生成；不会自动重复调用模型。', updated_at=time.time())
                    self._save(job)
                self.jobs[job['id']] = job
            except (OSError, ValueError, KeyError, TypeError):
                continue

    def _public(self, job):
        return copy.deepcopy({key: value for key, value in job.items() if key != 'fingerprint'})

    def get(self, job_id, fingerprint=None):
        with self.lock:
            self._load()
            job = self.jobs.get(job_id)
            if job and job['status'] in ('succeeded', 'failed') and time.time() - job['updated_at'] > self.retention:
                (self.directory / (job_id + '.json')).unlink(missing_ok=True)
                self.jobs.pop(job_id)
                job = None
            if job and fingerprint is not None and job['fingerprint'] != fingerprint:
                raise ValueError('任务编号已用于不同的出题请求。请重新创建练习。')
            return self._public(job) if job else None

    def submit(self, job_id, fingerprint, generate):
        with self.lock:
            self._load()
            if job_id in self.jobs:
                if self.jobs[job_id]['fingerprint'] != fingerprint:
                    raise ValueError('任务编号已用于不同的出题请求。')
                return self._public(self.jobs[job_id])
            # Never evict an active task. Completed results remain bounded and
            # expire after 24 hours; no documents or API credentials are journaled.
            finished = sorted((job for job in self.jobs.values() if job['status'] in ('succeeded', 'failed')),
                              key=lambda job: job['updated_at'])
            while finished and (len(self.jobs) >= self.capacity or time.time() - finished[0]['updated_at'] > self.retention):
                old = finished.pop(0)
                (self.directory / (old['id'] + '.json')).unlink(missing_ok=True)
                self.jobs.pop(old['id'])
            if len(self.jobs) >= self.capacity or sum(job['status'] in ('queued', 'running') for job in self.jobs.values()) >= 16:
                raise ValueError('后台任务较多，请等待已有任务完成后重试。')
            now = time.time()
            job = {'id': job_id, 'fingerprint': fingerprint, 'status': 'queued', 'created_at': now, 'updated_at': now}
            self._save(job)
            self.jobs[job_id] = job
            threading.Thread(target=self._run, args=(job_id, generate), daemon=True).start()
            return self._public(job)

    def _run(self, job_id, generate):
        with self.slots:
            try:
                with self.lock:
                    job = self.jobs[job_id]
                    job.update(status='running', updated_at=time.time())
                    self._save(job)
                result = generate()
                update = {'status': 'succeeded', 'result': result}
            except ValueError as error:
                update = {'status': 'failed', 'error': str(error)}
            except Exception:
                update = {'status': 'failed', 'error': '处理失败，请检查 PDF、网络及 API 配置。未使用示例题替代本次生成。'}
            with self.lock:
                job.update(**update, updated_at=time.time())
                try:
                    self._save(job)
                except OSError:
                    # Keep the result available in memory even if the disk filled.
                    pass
