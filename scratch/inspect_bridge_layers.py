import urllib.request
import json

url = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
try:
    with urllib.request.urlopen(url) as response:
        style = json.loads(response.read().decode('utf-8'))
    
    print(f"Total layers: {len(style['layers'])}")
    for layer in style['layers']:
        id_ = layer.get('id', '')
        type_ = layer.get('type', '')
        source_layer = layer.get('source-layer', '')
        if 'bridge' in id_.lower() or 'bridge' in source_layer.lower():
            print(f"Layer ID: {id_} | Type: {type_} | Source Layer: {source_layer}")
except Exception as e:
    print(f"Error fetching style: {e}")
