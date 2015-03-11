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


    var consolidator, dataCallback, errCallback, requestObj;

    var getData;
    // Stub out the request method.
    beforeEach(function(done) {
        dataCallback = null;
        errCalback = null;
        consolidator = new Consolidator();
        requestObj = {
            on: function(evt, callback) {
                if (evt === "error") {
                    errCallback = callback;
                }
            },
            end: function() {}
        };

        sinon.stub(http, "request", function(params, callback){
            setImmediate(function(){
                var responseObj = {
                    statusCode: 200,
                    params : params,
                    headers: {
                        "content-type": "text/json"
                    },
                    on: function(event, callback) {
                        if (event === "end") {
                            if (dataCallback) {
                                var responseData = getData ? getData(params) : "{}";
                                if(!responseData){
                                    responseObj.statusCode = 500;
                                }
                                dataCallback(responseData);
                            }
                            callback();
                        } else if (event === "data") {
                            dataCallback = callback;
                        }
                    }
                };

                callback(responseObj); 
            });
            return requestObj;
        });

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

        consolidator.poll(target, 0);

    });


    it("should poll multiple targets", function(done) {

        var targets = {
            "/foo/bar": ["test","ing"],
            "/foo/bar/0": "test",
            "/foo/bar/1": "ing",
            "/moo/woof":{
                "test": 1,
                "ing" : 2
            }
        };

        getData = function(params){
            if(targets[params.path]){
                return JSON.stringify(targets[params.path]);
            }else{
                return null;
            }
        };

        consolidator.on("error", function(data) {
            assert(1 === 2); // Should never error.
                done();
        });

        var hasDone = false;
        consolidator.on("data", function(data) {

            delete targets[data.origin];

            // no asserts becuase we will timeout if we don't get a response for all the targets
            if (!Object.keys(targets).length && !hasDone) {
                done();
                hasDone = true;
            }

        });

        Object.keys(targets).forEach(function(target) {
            setImmediate(function() {
                consolidator.poll(target, 0);
            });
        });

    });

    it("polls with large hierarchy", function(done){


        var targets = {
            "/foo/baz/bar": ["test","ing"],
            "/foo/baz/bar/0": "test",
            "/foo/baz/bar/1": "ing",
            "/foo/baz":{
                bar : ["test","ing"]
            }
        };

        getData = function(params){
            if(targets[params.path]){
                return JSON.stringify(targets[params.path]);
            }else{
                return null;
            }
        };

        consolidator.on("error", function(data) {
            assert(1 === 2); // Should never error.
                done();
        });

        var hasDone = false;
        consolidator.on("data", function(data) {

            delete targets[data.origin];

            // no asserts becuase we will timeout if we don't get a response for all the targets
            if (!Object.keys(targets).length && !hasDone) {
                done();
                hasDone = true;
            }

        });

        Object.keys(targets).forEach(function(target) {
            setImmediate(function() {
                consolidator.poll(target, 0);
            });
        });

    });

    it("produce request error", function(done) {

        // Force an error with the request object.
        requestObj.end = function() {
            errCallback("Forced an error");
        };

        var target = "/nowhere";
        consolidator.on("error", function(data) {
            done();
        });

        consolidator.poll(target, 0);
    });

    it("produce 500 status code error", function(done) {

        // Null forces a status code of 500
        getData = function(){
            return null;
        };


        var target = "/nowhere";
        consolidator.on("error", function(data) {
            done();
        });

        consolidator.poll(target, 0);
    });

    it("produces bad json", function(done) {

        // Null forces a status code of 500
        getData = function(){
            return "fo{'";
        };


        var target = "/nowhere";
        consolidator.on("error", function(data) {
            done();
        });

        consolidator.poll(target, 0);
    });

    afterEach(function() {
        http.request.restore();
        getData = null;
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
