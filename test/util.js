var assert = require('assert');
var util = require('../lib/util');

describe('Command-line arguments', function() {

  it('default', function(done) {
    assert.deepEqual(util.parseArgsSync(), {});
    done();
  });

  it('source = single directory', function(done) {
    assert.deepEqual(util.parseArgsSync([ 'examples/alice' ]), {
      spine: [
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
      ]
    });
    done();
  });

  it('metadata + source + headings', function(done) {
    var args = [
      '--title=Alice\u2019s Adventures in Wonderland',
      '--dc:creator=Lewis Caroll',
      'examples/alice',
      '--headings=h2'
    ];
    assert.deepEqual(util.parseArgsSync(args), {
      title: 'Alice\u2019s Adventures in Wonderland',
      dc: {
        creator: 'Lewis Caroll'
      },
      headings: 'h2',
      spine: [
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
      ]
    });
    done();
  });

});

