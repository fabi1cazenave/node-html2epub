html2epub
=========

Convert a collection of HTML documents into an EPUB.

Along with an HTML editor, this can be used as a lightweight alternative to EPUB
authoring systems (e.g. Calibre, Sigil…) to generate either tables of contents,
OPF files, or complete EPUB3 books.

This script can also be used to extract online web content and make a local EPUB
archive for offline reading.

Installation
------------

```
npm install html2epub -g
```

Basic usage
-----------

```
html2epub
  [ --config=/path/to/config.json      configuration file                          ]
  [ --basedir=/path/to/directory       base directory (default: current directory) ]
  [ --format=txt|json|xhtml|ncx|epub   output format  (default: txt)               ]
  [ --depth                            ToC depth      (default: not limited)       ]
```

Check the [examples](https://github.com/fabi1cazenave/node-ebook/tree/master/examples) directory for sample configuration files.

License
-------

MIT

Stability
---------

This works quite well but it’s still in a very early stage: pretty much
everything (including the name) is likely to change in the near future.

