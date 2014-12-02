var assert = require('assert');
var html2epub = require('../lib/html2epub');

describe('Constructor with no arguments', function() {
  var epub = new html2epub();

  it('valid UUID', function(done) {
    var uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    assert.ok(uuid.test(epub.identifier));
    done();
  });

  it('ISO-8601 compliant "modified" meta', function(done) {
    var iso = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
    assert.ok(iso.test(epub.modified));
    done();
  });

  it('default ToC settings', function(done) {
    assert.strictEqual(epub.headings.replace(/\s/g, ''), 'h1,h2,h3,h4,h5,h6');
    assert.strictEqual(epub.depth, 3);
    assert.strictEqual(epub.keepAllHeadings, false);
    done();
  });

  it('proper instance', function(done) {
    assert.ok(     epub   instanceof html2epub); // properly created with 'new'
    assert.ok(html2epub() instanceof html2epub); // dirty fallback
    done();
  });
});

describe('Headings extraction', function() {
  // TODO: test html2epub.getHeadings()
});

describe('Alice\'s Adventures in Wonderland', function() {
  var epub = new html2epub({
    basedir: 'examples/alice/'
  });

  it('spine', function(done) {
    assert.deepEqual(epub.spine, [
      '00.xhtml',
      '01.xhtml',
      '02.xhtml',
      '03.xhtml',
      '04.xhtml',
      '05.xhtml',
      '06.xhtml',
      '07.xhtml',
      '08.xhtml',
      '09.xhtml',
      '10.xhtml',
      '11.xhtml',
      '12.xhtml',
      '13.xhtml'
    ]);

    done();
  });

  it('ToC with default settings', function(done) {
    var pages = epub.parseHeadingsSync();

    assert.deepEqual(pages, [
      {
        href: '00.xhtml',
        headings: [{
          level: 0,
          title: 'Alice’s Adventures in Wonderland',
          href: '00.xhtml'
        }]
      },
      {
        href: '01.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER I. Down the Rabbit-Hole',
          href: '01.xhtml'
        }]
      },
      {
        href: '02.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER II. The Pool of Tears',
          href: '02.xhtml'
        }]
      },
      {
        href: '03.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER III. A Caucus-Race and a Long Tale',
          href: '03.xhtml'
        }]
      },
      {
        href: '04.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER IV. The Rabbit Sends in a Little Bill',
          href: '04.xhtml'
        }]
      },
      {
        href: '05.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER V. Advice from a Caterpillar',
          href: '05.xhtml'
        }]
      },
      {
        href: '06.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER VI. Pig and Pepper',
          href: '06.xhtml'
        }]
      },
      {
        href: '07.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER VII. A Mad Tea-Party',
          href: '07.xhtml'
        }]
      },
      {
        href: '08.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER VIII. The Queen\'s Croquet-Ground',
          href: '08.xhtml'
        }]
      },
      {
        href: '09.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER IX. The Mock Turtle\'s Story',
          href: '09.xhtml'
        }]
      },
      {
        href: '10.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER X. The Lobster Quadrille',
          href: '10.xhtml'
        }]
      },
      {
        href: '11.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER XI. Who Stole the Tarts?',
          href: '11.xhtml'
        }]
      },
      {
        href: '12.xhtml',
        headings: [{
          level: 1,
          title: 'CHAPTER XII. Alice\'s Evidence',
          href: '12.xhtml'
        }]
      },
      {
        href: '13.xhtml',
        headings: []
      }
    ]);

    assert.strictEqual(epub.showToC(pages, 'txt'),
      "\n    Alice’s Adventures in Wonderland" +
      "\n      CHAPTER I. Down the Rabbit-Hole" +
      "\n      CHAPTER II. The Pool of Tears" +
      "\n      CHAPTER III. A Caucus-Race and a Long Tale" +
      "\n      CHAPTER IV. The Rabbit Sends in a Little Bill" +
      "\n      CHAPTER V. Advice from a Caterpillar" +
      "\n      CHAPTER VI. Pig and Pepper" +
      "\n      CHAPTER VII. A Mad Tea-Party" +
      "\n      CHAPTER VIII. The Queen's Croquet-Ground" +
      "\n      CHAPTER IX. The Mock Turtle's Story" +
      "\n      CHAPTER X. The Lobster Quadrille" +
      "\n      CHAPTER XI. Who Stole the Tarts?" +
      "\n      CHAPTER XII. Alice's Evidence" +
      "\n");

    done();
  });

  it('ToC with "keepAllHeadings" setting', function(done) {
    epub.keepAllHeadings = true;
    var pages = epub.parseHeadingsSync();

    assert.deepEqual(pages[0], {
      href: '00.xhtml',
      headings: [
        {
          level: 0,
          title: 'Alice’s Adventures in Wonderland',
          href: '00.xhtml'
        },
        {
          level: 3,
          title: 'The Millennium Fulcrum Edition 3.0'
        }
      ]
    });

    done();
  });

  it('ToC with "h2" headings', function(done) {
    epub.headings = 'h2';
    var pages = epub.parseHeadingsSync();

    assert.deepEqual(pages, [
      {
        href: '00.xhtml',
        headings: []
      },
      {
        href: '01.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER I. Down the Rabbit-Hole',
          href: '01.xhtml'
        }]
      },
      {
        href: '02.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER II. The Pool of Tears',
          href: '02.xhtml'
        }]
      },
      {
        href: '03.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER III. A Caucus-Race and a Long Tale',
          href: '03.xhtml'
        }]
      },
      {
        href: '04.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER IV. The Rabbit Sends in a Little Bill',
          href: '04.xhtml'
        }]
      },
      {
        href: '05.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER V. Advice from a Caterpillar',
          href: '05.xhtml'
        }]
      },
      {
        href: '06.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER VI. Pig and Pepper',
          href: '06.xhtml'
        }]
      },
      {
        href: '07.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER VII. A Mad Tea-Party',
          href: '07.xhtml'
        }]
      },
      {
        href: '08.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER VIII. The Queen\'s Croquet-Ground',
          href: '08.xhtml'
        }]
      },
      {
        href: '09.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER IX. The Mock Turtle\'s Story',
          href: '09.xhtml'
        }]
      },
      {
        href: '10.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER X. The Lobster Quadrille',
          href: '10.xhtml'
        }]
      },
      {
        href: '11.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER XI. Who Stole the Tarts?',
          href: '11.xhtml'
        }]
      },
      {
        href: '12.xhtml',
        headings: [{
          level: 0,
          title: 'CHAPTER XII. Alice\'s Evidence',
          href: '12.xhtml'
        }]
      },
      {
        href: '13.xhtml',
        headings: []
      }
    ]);

    assert.strictEqual(epub.showToC(pages, 'txt'),
      "\n    CHAPTER I. Down the Rabbit-Hole" +
      "\n    CHAPTER II. The Pool of Tears" +
      "\n    CHAPTER III. A Caucus-Race and a Long Tale" +
      "\n    CHAPTER IV. The Rabbit Sends in a Little Bill" +
      "\n    CHAPTER V. Advice from a Caterpillar" +
      "\n    CHAPTER VI. Pig and Pepper" +
      "\n    CHAPTER VII. A Mad Tea-Party" +
      "\n    CHAPTER VIII. The Queen's Croquet-Ground" +
      "\n    CHAPTER IX. The Mock Turtle's Story" +
      "\n    CHAPTER X. The Lobster Quadrille" +
      "\n    CHAPTER XI. Who Stole the Tarts?" +
      "\n    CHAPTER XII. Alice's Evidence" +
      "\n");

    done();
  });
});

