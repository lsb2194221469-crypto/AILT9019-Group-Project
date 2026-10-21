"""Check credentials without sending lecture text or generating paid questions."""
from server import provider_request, read_config

try:
    config = read_config()
    result = provider_request('models', config=config)
    models = [entry.get('id') for entry in result.get('data', []) if isinstance(entry, dict)]
    if config['model'] in models:
        print('连接成功，已找到配置的模型。可以回到网页生成题目。')
    else:
        print('API 已响应，但未找到配置的模型。请核对 model；部分服务商不提供完整模型列表。')
except ValueError as error:
    print(str(error))
    raise SystemExit(1)
except Exception:
    print('连接检查失败：服务返回了无法识别的数据。')
    raise SystemExit(1)
