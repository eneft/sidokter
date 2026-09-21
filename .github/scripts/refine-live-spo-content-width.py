from pathlib import Path

pagination_path = Path('src/utils/canonicalA4Pagination.ts')
test_path = Path('tests/live-sop-content-integrity.test.ts')

pagination = pagination_path.read_text()
tests = test_path.read_text()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)

pagination = replace_once(
    pagination,
    "const CSS_PX_PER_MM = 96 / 25.4;\n",
    "const CSS_PX_PER_MM = 96 / 25.4;\nconst OFFICIAL_CELL_HORIZONTAL_BORDER_PX = 2;\n",
    'official cell horizontal border constant',
)

pagination = replace_once(
    pagination,
    """  const innerWidthMm = cellWidthMm - SOP_SECTION_CELL_PADDING_MM * 2;
  const innerWidthPx = innerWidthMm * CSS_PX_PER_MM;
  return Math.round(innerWidthPx * 10) / 10;
""",
    """  const innerWidthMm = cellWidthMm - SOP_SECTION_CELL_PADDING_MM * 2;
  // The content box also excludes the official 1px left/right cell borders.
  // In Chromium's collapsed table layout this keeps the measurement width
  // within a sub-pixel of the actual Preview/Live authored-content box.
  const innerWidthPx = innerWidthMm * CSS_PX_PER_MM - OFFICIAL_CELL_HORIZONTAL_BORDER_PX;
  return Math.round(innerWidthPx * 10) / 10;
""",
    'canonical content border subtraction',
)

tests = replace_once(
    tests,
    "const expectedInnerWidth = (116.4 * 96) / 25.4;",
    "const expectedInnerWidth = (116.4 * 96) / 25.4 - 2;",
    'content width regression expectation',
)

pagination_path.write_text(pagination)
test_path.write_text(tests)
print('Canonical content width refined for official cell borders.')
