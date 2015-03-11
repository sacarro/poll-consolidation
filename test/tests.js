var assert = require("assert");
var http = require("http");
var sinon = require("sinon");
var Consolidator = require("../src").Consolidator;

describe("_createNode", function() {

    it("should create a node with no parent", function() {
        var consolidator = new Consolidator();
        var node = consolidator._createNode("moo", "/moo");
        assert(!node.parent);
        assert(node.name === "moo");
    });

    it("should create a node with a parent", function() {
        var consolidator = new Consolidator();
        var parentNode = consolidator._createNode("moo", ["moo"]);
        var node = consolidator._createNode("baa", "/moo/baa", parentNode);

        assert(node.parent);
        assert(node.parent.children.baa);
        assert(node.parent.children.baa === node);
        assert(node.name === "baa");
        assert(node.path === "/moo/baa");

    });
});

describe("_ensureTree", function() {

    it("should create a tree to the node", function() {
        var consolidator = new Consolidator();
        consolidator._ensureTree(["moo", "baa"], "/moo/bar");
        assert(consolidator.root.children.moo);
        assert(consolidator.root.children.moo.children.baa);
        assert(consolidator.root.children.moo.children.baa.emit);
        consolidator._ensureTree(["moo", "baa", "woof"], "/moo/baa/woof");
        assert(consolidator.root.children.moo.children.baa.children.woof.emit);
        consolidator._ensureTree(["quack"], "/quack");
        assert(consolidator.root.children.quack.emit);
        assert(consolidator.root.children.quack.path === "/quack");
    });

});

describe("_consolidate", function() {

    it("should consolidate polls of all children to root node moo", function() {
        var consolidator = new Consolidator();
        consolidator._ensureTree(["moo", "baa", "oink"], "/moo/baa/oink");
        assert(consolidator.root.children.moo.children.baa.children.oink.emit);
        assert(consolidator.root.children.moo.children.baa.children.oink.poll);
        consolidator._ensureTree(["moo", "baa", "woof"], "/moo/baa/woof");
        assert(consolidator.root.children.moo.children.baa.children.woof.emit);
        assert(consolidator.root.children.moo.children.baa.children.woof.poll);
        var node = consolidator._ensureTree(["moo"], "/moo");

        consolidator._consolidate(node);

        assert(consolidator.root.children.moo.emit);
        assert(consolidator.root.children.moo.poll);
        assert(!consolidator.root.children.moo.children.baa.emit);
        assert(!consolidator.root.children.moo.children.baa.poll);
        assert(consolidator.root.children.moo.children.baa.children.woof.emit);
        assert(!consolidator.root.children.moo.children.baa.children.woof.poll);
        assert(consolidator.root.children.moo.children.baa.children.oink.emit);
        assert(!consolidator.root.children.moo.children.baa.children.oink.poll);
    });

    it("should consolidate polls of all children to baa", function() {
        var consolidator = new Consolidator();
        consolidator._ensureTree(["moo", "baa", "oink"], "/moo/baa/oink");
        assert(consolidator.root.children.moo.children.baa.children.oink.emit);
        assert(consolidator.root.children.moo.children.baa.children.oink.poll);
        consolidator._ensureTree(["moo", "baa", "woof"], "/moo/baa/woof");
        assert(consolidator.root.children.moo.children.baa.children.woof.emit);
        assert(consolidator.root.children.moo.children.baa.children.woof.poll);
        var node = consolidator._ensureTree(["moo", "baa"], "/moo/baa");

        consolidator._consolidate(node);

        assert(!consolidator.root.children.moo.emit);
        assert(!consolidator.root.children.moo.poll);
        assert(consolidator.root.children.moo.children.baa.emit);
        assert(consolidator.root.children.moo.children.baa.poll);
        assert(consolidator.root.children.moo.children.baa.children.woof.emit);
        assert(!consolidator.root.children.moo.children.baa.children.woof.poll);
        assert(consolidator.root.children.moo.children.baa.children.oink.emit);
        assert(!consolidator.root.children.moo.children.baa.children.oink.poll);
    });

    it("should consolidate polls to bar", function() {

        var consolidator = new Consolidator();
        // Start a new subtree whose poll node is not determined at the root of the whole tree
        consolidator._ensureTree(["foo", "bar", "0"], "/foo/bar/0");
        consolidator._ensureTree(["foo", "bar", "1"], "/foo/bar/1");
        var node = consolidator._ensureTree(["foo", "bar", "2"], "/foo/bar/2");

        consolidator._consolidate(node);
        assert(!consolidator.root.children.foo.emit);
        assert(!consolidator.root.children.foo.poll);
        assert(!consolidator.root.children.foo.children.bar.emit);
        assert(consolidator.root.children.foo.children.bar.poll);
        assert(consolidator.root.children.foo.children.bar.children["0"].emit);
        assert(!consolidator.root.children.foo.children.bar.children["0"].poll);
        assert(consolidator.root.children.foo.children.bar.children["1"].emit);
        assert(!consolidator.root.children.foo.children.bar.children["1"].poll);
        assert(consolidator.root.children.foo.children.bar.children["2"].emit);
        assert(!consolidator.root.children.foo.children.bar.children["2"].poll);
    });

});


describe("poll", function() {


    var consolidator, dataCallback, errCallback, responseObj, requestObj;
    
    // Stub out the request method.
    beforeEach(function(done) {
        dataCallback = null;
        errCalback = null;
        consolidator = new Consolidator();
        responseObj = {
            statusCode: 200,
            on: function(event, callback) {
                if (event === "end") {
                    if (dataCallback) {
                        dataCallback(JSON.stringify({
                            ok: 1
                        }));
                    }
                    callback();
                } else if (event === "data") {
                    dataCallback = callback;
                }
            }
        };

        requestObj = {
            on: function(evt, callback) {
                if (evt === "error") {
                    errCallback = callback;
                }
            },
            end: function() {}
        };
        sinon.stub(http, "request").yields(responseObj).
        returns(requestObj);
        done();
    });

    it("should poll one target", function(done) {

        var target = "/foo/bar/0";
        consolidator.on("error", function(data) {
            console.log("Error", data);
            done();
        });

        consolidator.on("data", function(data) {
            assert(data.origin === target);
            if (done) {
                done();
                done = null;
            }
        });

        consolidator.poll(target);

    });

    it("should poll multiple targets", function(done) {

        var targets = ["/foo/bar", "/foo/bar/0", "/foo/bar/1", "/moo/woof"];
        consolidator.on("error", function(data) {
            assert(1 === 2); // Should never error.
            done();
        });

        var hasDone = false;
        consolidator.on("data", function(data) {

            var idx = targets.indexOf(data.origin);
            if (idx > -1) {
                targets.splice(idx, 1);
            }

            // no asserts becuase we will timeout if we don't get a response for all the targets
            if (!targets.length && !hasDone) {
                done();
                hasDone = true;
            }

        });

        targets.forEach(function(target) {
            setImmediate(function() {
                consolidator.poll(target, 1500);
            });
        });

    });
    it("should error", function(done) {

        // Force an error with the request object.
        requestObj.end = function() {
            errCallback("Forced an error");
        };

        var target = "/foo/bar/0";
        consolidator.on("error", function(data) {
            done();
        });

        consolidator.poll(target);
    });

    afterEach(function() {
        http.request.restore();
        consolidator = null;
    });
});

/*
 console.log(JSON.stringify(consolidator.root, function(key, value) {
    if (key === "parent") {
        return "[circular]";
    } else {
        return value;
    }
}, "\t"));
*/
