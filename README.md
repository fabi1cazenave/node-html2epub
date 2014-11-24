node-ebook
==========

Convert a bunch of HTML documents into an EPUB.

This should become a node module when it’s ready; right now it’s just a script
to extract tables of contents and make EPUBs from HTML documents.

Basic usage
-----------

```
./ebook.js
  [ --config=/path/to/config.json      configuration file                          ]
  [ --basedir=/path/to/directory       base directory (default: current directory) ]
  [ --format=txt|json|xhtml|ncx|epub   output format  (default: txt)               ]
  [ --depth                            ToC depth      (default: not limited)       ]
```

Check the `examples` directory for sample configuration files.

