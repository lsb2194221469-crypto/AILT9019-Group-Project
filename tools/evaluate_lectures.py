"""Prepare the local SDST2601 pilot; --live explicitly enables billed requests.

Original course files are intentionally not distributed. Use only materials you
are authorised to process. Generated inputs/outputs stay in the chosen directory.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server
from pypdf import PdfReader,PdfWriter

SPECS=[
 ('discrete','lecture3_probability_rv.pdf',[16,19,20,21,23,24,26,27,31,32,35,36,38]),
 ('continuous','lecture5_continuous_rv.pdf',[11,12,13,14,15,16,18,19,20,21,22,24,31,32]),
 ('properties','lecture6_properties_dist.pdf',[8,9,11,14,18,19,22,23,30,34,35,38]),
]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,default=ROOT/'.evaluation-runs')
    parser.add_argument('--prompt',choices=['initial','revised'],default='revised')
    parser.add_argument('--live',action='store_true',help='Call the configured provider and consume API quota')
    args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    documents,manifest=[],[]
    for case,name,numbers in SPECS:
        original=(args.source_dir/name).read_bytes()
        reader,writer=PdfReader(args.source_dir/name),PdfWriter()
        for number in numbers:writer.add_page(reader.pages[number-1])
        target=args.output_dir/(case+'.pdf')
        with target.open('wb') as output:writer.write(output)
        data=target.read_bytes()
        documents.append({'id':case,'name':target.name,'pages':server.extract_pdf(data)})
        manifest.append({'case':case,'source_name':name,'source_sha256':hashlib.sha256(original).hexdigest(),
                         'original_physical_pages':numbers,'input_sha256':hashlib.sha256(data).hexdigest()})
    (args.output_dir/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    if not args.live:
        print('Prepared three local lecture excerpts. No API call. Add --live to generate paid results.')
        return
    original_provider=server.provider_request
    def provider(path,payload=None,config=None):
        if payload and args.prompt=='initial':
            payload={**payload,'messages':[dict(message) for message in payload['messages']]}
            payload['messages'][0]['content']=payload['messages'][0]['content'].split('\nQUESTION QUALITY:',1)[0]
        return original_provider(path,payload,config)
    server.provider_request=provider
    model=server.read_config()['model']
    batches=[(doc['id'],[doc],{'mcq':2,'tf':2,'short':2}) for doc in documents]
    batches.append(('multi_pdf',documents,{'mcq':1,'tf':1,'short':1}))
    for case,docs,counts in batches:
        target=args.output_dir/(args.prompt+'-'+case+'.json')
        if target.exists():
            print(case+': existing result retained; choose a new output directory for another paid run.')
            continue
        began=time.monotonic()
        record={'case':case,'mode':'live API','prompt':args.prompt,'model':model,'requested_counts':counts}
        try:
            record['result']=server.generate(server.combine_sources(docs),model,'mcq',sum(counts.values()),'',counts=counts)
        except ValueError as error:record['error']=str(error)
        record['elapsed_seconds']=round(time.monotonic()-began,3)
        target.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'case':case,'questions':len(record.get('result',{}).get('questions',[])),
                          'elapsed_seconds':record['elapsed_seconds'],'failed':'error' in record}))

if __name__=='__main__':main()
