// Converts the captured PNGs (.learn-shots) to public/learn/*.webp. Needs python3 + Pillow (or use sharp).
import { execFileSync } from 'node:child_process';
execFileSync(
  'python3',
  [
    '-c',
    "from PIL import Image;import glob,os;os.makedirs('public/learn',exist_ok=True)\nfor f in sorted(glob.glob('.learn-shots/*.png')):\n  Image.open(f).convert('RGB').save('public/learn/'+os.path.basename(f)[:-4]+'.webp','WEBP',quality=78,method=6)",
  ],
  { stdio: 'inherit' },
);
