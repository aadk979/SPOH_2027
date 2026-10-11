# Bundled print fonts

These unmodified official Noto fonts are bundled for server-generated PDFs. Rendering never
downloads fonts. PDF embedding subsets only the glyphs used by the document. OFL notices
travel with the image; embedding does not change the document's own licence.

| File                      | Official source                                                                                                                                                                                                 | SHA-256                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| NotoSans-Regular.ttf      | [notofonts/noto-fonts, ffebf8c1ee449e544955a7e813c54f9b73848eac](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSans/NotoSans-Regular.ttf)                | b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5 |
| NotoSansTamil-Regular.ttf | [same pinned revision](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansTamil/NotoSansTamil-Regular.ttf)                                                | 6532db33b8b264abe3a098a40619feb489b5ddf5ab1d2b46e72b51eeb548001b |
| NotoSansSC-VF.ttf         | [notofonts/noto-cjk, Sans2.004 commit 523d033d6cb47f4a80c58a35753646f5c3608a78](https://github.com/notofonts/noto-cjk/blob/523d033d6cb47f4a80c58a35753646f5c3608a78/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf) | d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964 |
| OFL-noto.txt              | [noto-fonts LICENSE, pinned revision](https://github.com/notofonts/noto-fonts/blob/ffebf8c1ee449e544955a7e813c54f9b73848eac/LICENSE)                                                                            | 0dab92d0544f7b233403f14b84a663bdbfa746982eda629e7f4f9ffe1b036feb |
| OFL-noto-cjk.txt          | [noto-cjk LICENSE, Sans2.004](https://github.com/notofonts/noto-cjk/blob/Sans2.004/LICENSE)                                                                                                                     | 6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2 |

The set covers Latin/Malay, Chinese/CJK and Tamil labels. Unsupported graphemes are rejected
before publication rather than silently replaced with ASCII or missing-glyph boxes. Further
scripts require a reviewed pinned font and rendering regression. These are private server
assets, not browser downloads. Docker explicitly copies `server/assets/fonts` into runtime.

The Chinese asset is the official unmodified TrueType variable regional subset. Both shaping
and embedding instantiate its Regular (`wght=400`) outlines through fontkit's public variation
API; the source defaults to Thin. The CFF OpenType build was rejected after Poppler reported
invalid embedded subsets and rendered missing glyphs. Artifact checks include the actual font
program, and local visual review must render Chinese, Tamil marks and Latin combining accents.
