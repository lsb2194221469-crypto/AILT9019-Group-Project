"""Small paid integration check on author-written public notes; requires --live."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server
from topic_guard import TopicBoundaryError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Allow paid model calls (up to 9 normally, more if question JSON is retried)')
    parser.add_argument('--output', type=Path, default=ROOT / '.example-runs/topic-boundary.json')
    args = parser.parse_args()
    if not args.live:
        parser.error('This check uses provider quota. Pass --live to run it.')
    config = server.read_config()
    docs, inputs = [], []
    for name in ('matrix-notes.pdf', 'probability-notes.pdf'):
        file = ROOT / 'examples/topic-boundary' / name
        data = file.read_bytes()
        docs.append({'id': name, 'name': name, 'pages': server.extract_pdf(data)})
        inputs.append({'path': file.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(data).hexdigest()})
    cases = [
        ('covered', 'matrix addition', docs[:1], 'generated'),
        ('paraphrase', 'adding two tables of numbers entry by entry', docs[:1], 'generated'),
        ('outside_scope', "Bayes' theorem and conditional probability", docs[:1], 'blocked'),
        ('partly_outside', "matrix addition and Bayes' theorem", docs[:1], 'blocked'),
        ('blank', '', docs[:1], 'generated'),
        ('coverage_in_second_pdf', "Bayes' theorem and conditional probability", docs, 'generated')]
    report = {'recorded_at': datetime.now(timezone.utc).isoformat(), 'provider': 'configured cloud model',
              'model': config['model'], 'live_requests': True, 'inputs': inputs, 'cases': [],
              'limits': 'One run per case on small author-written notes. Pass means expected routing and valid output, not proven mathematical correctness or general topic-detection accuracy.'}
    original = server.provider_request
    for name, topic, sources, expected in cases:
        calls = []
        def tracked(path, payload, settings):
            stage = 'topic_check' if payload['messages'][0]['content'].startswith('Check whether the supplied PDF material') else 'questions'
            entry = {'stage': stage}
            calls.append(entry)
            result = original(path, payload, settings)
            usage = result.get('usage', {})
            entry['usage'] = {key: usage[key] for key in ('prompt_tokens', 'completion_tokens', 'total_tokens') if key in usage}
            return result
        server.provider_request = tracked
        row = {'name': name, 'topic': topic, 'pdfs': [s['name'] for s in sources], 'expected': expected}
        try:
            result = server.generate(server.combine_sources(sources), config['model'], 'tf', 1, topic)
            row.update(actual='generated', result=result)
        except TopicBoundaryError as error:
            row.update(actual='blocked' if error.code == 'topic_not_covered' else 'check_failed', code=error.code, message=str(error))
        except ValueError as error:
            row.update(actual='failed', message=str(error))
        finally:
            server.provider_request = original
        row['calls'] = calls
        row['passed'] = row['actual'] == expected and (expected != 'blocked' or all(c['stage'] != 'questions' for c in calls))
        report['cases'].append(row)
        report['passed'] = len(report['cases']) == len(cases) and all(c['passed'] for c in report['cases'])
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f"{name}: expected {expected}, observed {row['actual']}, calls {len(calls)}, passed {row['passed']}", flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
