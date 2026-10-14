"""Install the reviewed native lecturer release without training."""
import argparse
import os
from pathlib import Path
from uuid import uuid4

from ai.catboost_model import load_bundle


def main():
    parser = argparse.ArgumentParser(description='Verify and install the lecturer native CatBoost release')
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    manifest = Path(__file__).with_name('catboost.manifest.json')
    try:
        bundle = load_bundle(args.source, manifest)
        if not args.verify_only:
            root = Path(__file__).resolve().parents[1]
            destination = root/'.local/ai/catboost'
            if not destination.resolve().is_relative_to(root):
                raise ValueError('Destination must remain inside the workspace')
            destination.mkdir(parents=True, exist_ok=True)
            # Verify all content before any destination mutation. Same release is idempotent.
            for target, content in [(destination/'model.cbm', args.source.read_bytes()),
                                    (destination/'manifest.json', manifest.read_bytes())]:
                if target.is_file() and target.read_bytes() == content:
                    continue
                staged = target.with_name(f'.{target.name}.{uuid4().hex}.tmp')
                try:
                    staged.write_bytes(content)
                    os.replace(staged, target)
                finally:
                    staged.unlink(missing_ok=True)
        print(f"Verified CatBoost {bundle['metadata']['modelVersion']}: {bundle['metadata']['artifactSha256']}")
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'Cannot import native CBM release: {error}\n')


if __name__ == '__main__':
    main()
