import urllib.request
import json

url = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
try:
    with urllib.request.urlopen(url) as response:
        style = json.loads(response.read().decode('utf-8'))
    
    for layer in style['layers']:
        id_ = layer.get('id', '')
        if 'tunnel' in id_.lower():
            print(f"Tunnel Layer ID: {id_}")
except Exception as e:
    print(f"Error: {e}")
