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
        # Print if it contains road, street, rail, or label in id or source-layer
        if any(term in id_.lower() or term in source_layer.lower() for term in ['road', 'street', 'rail', 'label', 'highway', 'route']):
            print(f"Layer ID: {id_} | Type: {type_} | Source Layer: {source_layer}")
            # If it's paint, print paint keys
            if 'paint' in layer:
                print(f"  Paint keys: {list(layer['paint'].keys())}")
except Exception as e:
    print(f"Error fetching style: {e}")
