"""Regenerates every sprite in assets/ from scratch."""

import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
STEPS = ['gen_character.py', 'gen_tiles.py', 'gen_objects.py', 'gen_font.py']

for step in STEPS:
    print(f'--- {step}')
    r = subprocess.run([sys.executable, os.path.join(HERE, step)], cwd=HERE)
    if r.returncode != 0:
        sys.exit(r.returncode)
print('assets regenerated')
