html2epub
=========
Convert a collection of HTML documents into an [IDPF-compliant](http://validator.idpf.org/)
EPUB3 document.

[![NPM](https://nodei.co/npm/html2epub.png)](https://nodei.co/npm/html2epub/)

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
  [ --format=txt|json|xhtml|ncx|epub   output format  (default: epub)              ]
  [ --headings="CSS selector"          ToC headings   (default: h1,h2,h3,h4,h5,h6  ]
  [ --depth                            ToC depth      (default: 3)                 ]
```

Check the [examples](https://github.com/fabi1cazenave/node-ebook/tree/master/examples)
 directory for sample configuration files.

License
-------

* the code is released under the MIT license
* in the examples folder, `alice` is subject to the [Gutenberg™ license](http://gutenberg.org/license)

Stability
---------

This works quite well but it’s still in a very early stage: pretty much
everything (including the name) is likely to change in the near future.

Alternatives
------------

Here are a few other HTML-to-EPUB solutions that could suit your needs:

* [aov-html2epub](https://github.com/angelortega/aov-html2epub)
* [ebook-convert](http://manual.calibre-ebook.com/cli/ebook-convert.html)
* [GrabMyBooks](https://addons.mozilla.org/en-US/firefox/addon/grabmybooks/)

Note: if you only need to store a web page in a single file,
[wget64](https://www.npmjs.org/package/wget64) is a good alternative to EPUB
documents.

