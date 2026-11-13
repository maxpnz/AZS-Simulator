"""Normalize the individually generated, transparent v0.5.2 vehicle masters.

This is a lossless-layout / downsampling step, not a source of vehicle artwork.
The source paths are retained in the asset specification for provenance.
"""
import argparse
from pathlib import Path
from PIL import Image
import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path, help='directory with the generated PNG masters')
SOURCE = parser.parse_args().source
DEST = Path(__file__).resolve().parents[1] / 'src/assets/v052'
FILES = {
    'city-hatch':'fb9ede6b-b074-4601-993f-61047e323bf3',
    'budget-sedan':'686ee5ae-0421-4e23-95ea-c9eb56bca903',
    'family-sedan':'394d3563-f1b1-434d-a17f-4316aeb1e849',
    'business-sedan':'fd9de8d8-7de5-4790-91d7-04d90766aae8',
    'estate-wagon':'a51be0b4-924b-43e1-b100-a00f8cf44787',
    'compact-crossover':'5accd49a-433b-4d69-b4d5-08f1840ab16f',
    'mid-suv':'dce460c9-bbce-496f-9e9a-b4e8d4f80c3b',
    'full-suv':'dc7ed541-dbac-4b5f-bf79-d71a08ce7daf',
    'minivan':'043e0cf6-80fa-499a-bd98-fe9ccd9cf37a',
    'sport-coupe':'0ac34628-4a1c-4b72-91d6-f111d595d48c',
    'pickup':'712fd5c9-6af6-4515-be8c-6733a5d388ad',
    'delivery-van':'abe85ca9-c4f8-4a91-8dfa-17b058b60eb3',
    'medium-truck':'6425a5dd-71ca-48d0-8ff1-991b4709a1bb',
    'heavy-truck':'5153e388-e5ea-4acf-bbb3-16ebd9e5d369',
    'coach-bus':'014e16fb-437d-452a-81e3-539aeb71e4a4',
    'semi-trailer':'1a4621f1-dd81-493d-be5f-21ee6ce01569',
    'fuel-tanker':'5bbffb4d-c912-4740-addf-6bb8438e9d49',
}
DEST.mkdir(parents=True, exist_ok=True)
for index, (name, uuid) in enumerate(FILES.items(), 1):
    image = Image.open(SOURCE / f'exec-{uuid}.png').convert('RGBA')
    pixels = np.array(image)
    opaque = (pixels[:,:,3] >= 70).astype('uint8')
    count, components, stats, _ = cv2.connectedComponentsWithStats(opaque, 8)
    largest = 1 + int(np.argmax(stats[1:,cv2.CC_STAT_AREA])) if count > 1 else 0
    body = (components == largest).astype('uint8')
    # Keep two pixels of antialiasing around the connected vehicle, remove
    # isolated generated flecks and the low-alpha paper haze in a few masters.
    body = cv2.dilate(body, np.ones((5,5),dtype='uint8'))
    pixels[:,:,3] = np.where(body > 0, np.where(pixels[:,:,3] < 55, 0, pixels[:,:,3]), 0)
    image = Image.fromarray(pixels, 'RGBA')
    alpha = image.getchannel('A')
    # Ignore sparse low-alpha generation noise beyond the visible silhouette.
    mask = alpha.point(lambda value: 255 if value >= 80 else 0)
    bounds = mask.getbbox()
    if not bounds:
        raise ValueError(f'{name}: empty alpha')
    margin = round((bounds[2]-bounds[0]) * .025)
    bounds = (max(0,bounds[0]-margin),max(0,bounds[1]-margin),
              min(image.width,bounds[2]+margin),min(image.height,bounds[3]+margin))
    image = image.crop(bounds)
    # Desktop and mobile share a fixed modest texture budget.
    max_width = 960 if index >= 13 else 640
    if image.width > max_width:
        image.thumbnail((max_width, 512), Image.Resampling.LANCZOS)
    image.save(DEST / f'{index:02d}_{name}.png', optimize=True)
    print(f'{index:02d}_{name}.png {image.width}x{image.height}')
