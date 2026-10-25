"""Check the committed example offline, or explicitly reproduce it with a live API."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server

COUNTS={'mcq':1,'tf':1,'short':1}
PDF=ROOT/'examples/math-notes.pdf'
REFERENCE=ROOT/'examples/expected-output.json'


def validate(record,pages):
    if record.get('input_sha256') != hashlib.sha256(PDF.read_bytes()).hexdigest():
        raise ValueError('The recorded input hash does not match examples/math-notes.pdf.')
    result=record['result']
    if result.get('sample') is not False:
        raise ValueError('The output must be a generated quiz, not the prewritten sample.')
    valid,actual=server.validate_mixed(result.get('questions'),pages,COUNTS)
    if actual!=COUNTS or len(valid)!=3 or len(result['questions'])!=3:
        raise ValueError('Expected exactly one valid MCQ, true/false and short-answer question.')
    if result.get('actual_counts')!=COUNTS or result.get('requested_counts')!=COUNTS:
        raise ValueError('Reported counts do not match the example request.')
    if any(q.get('source_name')!=PDF.name for q in result['questions']):
        raise ValueError('A question cites a different PDF.')
    return actual


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true',help='Call the configured provider; consumes API quota.')
    parser.add_argument('--output',type=Path,help='Save a new live result; the committed reference is never overwritten.')
    args=parser.parse_args()
    if args.output and not args.live: parser.error('--output requires --live')
    if args.output and args.output.resolve()==REFERENCE.resolve():
        parser.error('Choose a different output path to preserve the reference.')
    pages=server.combine_sources([{'id':'example-math-notes','name':PDF.name,
                                  'pages':server.extract_pdf(PDF.read_bytes())}])
    if args.live:
        config=server.read_config()
        started=time.monotonic()
        result=server.generate(pages,config['model'],None,None,'',counts=COUNTS)
        record={'input':'examples/math-notes.pdf',
                'input_sha256':hashlib.sha256(PDF.read_bytes()).hexdigest(),
                'provenance':{'kind':'live_provider_response','model':config['model'],
                              'verified_at_utc':datetime.now(timezone.utc).isoformat(),
                              'elapsed_seconds':round(time.monotonic()-started,2)},
                'result':result}
    else:
        record=json.loads(REFERENCE.read_text(encoding='utf-8'))
    counts=validate(record,pages)
    if args.output:
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':True,'mode':'live API' if args.live else 'offline saved-output check',
                      'input_pages':len(pages),'questions':3,'actual_counts':counts,
                      'source_checks':'passed','api_called':args.live},indent=2))


if __name__=='__main__':
    try:
        main()
    except (ValueError,KeyError,OSError) as error:
        # Provider failures already contain sanitized messages; never print configuration.
        print('Example check failed: '+str(error),file=sys.stderr)
        raise SystemExit(1)
