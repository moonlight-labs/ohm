/* eslint-env browser */

'use strict';

// TODO: handle invalid grammar in textbox
// TODO: fix needed eamples bug (need force update to get rid of ident)

(function(root, initModule) {
  if (typeof exports === 'object') {
    module.exports = initModule;
  } else {
    root.exampleWorkerManager = initModule(root.ohm, root.ohmEditor,
                                           root.utils, root.httpUtil, root.CheckedEmitter);
  }
})(this, function(ohm, ohmEditor, utils, httpUtil, CheckedEmitter) {
  var exampleWorkerManager = new CheckedEmitter();

  exampleWorkerManager.registerEvents({
    'received:examples': ['ruleName', 'examples'],
    'received:neededExamples': ['neededExamples'],
    'started:worker': []
  });

  var eventsToEmit = ['received:examples', 'received:neededExamples', 'started:worker'];

  var exampleWorker = new Worker('exampleWorker.js');

  // TODO: may want to reset current worker instead

  function resetWorker(grammar) {
    if (exampleWorker) {
      exampleWorker.terminate();
    }
    exampleWorker = new Worker('exampleWorker.js');
    exampleWorker.onmessage = onWorkerMessage;
    saveGrammarToDB(grammar)
      .then(function() {
        exampleWorker.postMessage({
          name: 'initialize', grammarName: grammar.name
        });
      });
  }

  function saveGrammarToDB(grammar) {
    var baseUrl = location.toString().match(/^(.*)\/_design\//)[1];
    return httpUtil.$http(baseUrl + '/_design/ohm/_rewrite/grammars/' + grammar.name)
      .post(grammar.source.contents);
  }

  ohmEditor.addListener('parse:grammar', function(_, g, err) {
    if (!err) {
      resetWorker(g);
    }
  });

  ohmEditor.examples.addListener('set:example', function(_, oldValue, newValue) {
    var grammar;
    if (newValue.text.trim() === '') {
      return;
    } else if (oldValue && oldValue.text.trim() === '' ||
               !oldValue) {
      grammar = ohmEditor.grammar;
      if (grammar.match(newValue.text, newValue.startRule).succeeded()) {
        exampleWorkerManager.addUserExample(newValue.startRule || grammar.defaultStartRule,
                                            newValue.text);
      }
    } else {
      resetWorker(ohmEditor.grammar);
    }
  });

  ohmEditor.examples.addListener('remove:example', function(_) {
    resetWorker(ohmEditor.grammar);
  });

  function onWorkerMessage(event) {
    if (eventsToEmit.includes(event.data.name)) {
      exampleWorkerManager.emit.apply(exampleWorkerManager,
                                      [event.data.name].concat(event.data.args));
    } else {
      /* eslint-disable no-console */
      console.debug('WORKER:', event.data);
      /* eslint-enable no-console */
    }
  }

  exampleWorkerManager.requestExamples = function(ruleName) {
    relayEvent('request:examples', [ruleName]);
  };

  exampleWorkerManager.updateNeededExamples = function() {
    relayEvent('update:neededExamples', []);
  };

  exampleWorkerManager.addUserExample = function(ruleName, example) {
    relayEvent('add:userExample', [ruleName, example]);
  };

  function relayEvent(eventName, args) {
    exampleWorker.postMessage({
      name: eventName,
      args: args
    });
  }

  exampleWorkerManager.neededExamples = null;
  exampleWorkerManager.addListener('received:neededExamples', function(neededExamples) {
    exampleWorkerManager.neededExamples = neededExamples;

  });

  exampleWorkerManager.addListener('started:worker', function() {
    var examples = ohmEditor.examples.getExamples();
    Object.keys(examples).forEach(function(id) {
      var example = examples[id];
      var match = grammar.match(example.text, example.startRule);

      if (match.succeeded()) {
        exampleWorkerManager.addUserExample(example.startRule || grammar.defaultStartRule,
                                            example.text);
      }
    });
  });

  return exampleWorkerManager;
});
