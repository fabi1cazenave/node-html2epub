html2epub
=========

Convert a bunch of HTML documents into an EPUB.

Right now it’s just a script to extract tables of contents and make EPUBs from
HTML documents. Please consider this module as a proof of concept for now:
pretty much everything (including the name) is likely to change in the near
future.

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

Check the `examples` directory for sample configuration files.

