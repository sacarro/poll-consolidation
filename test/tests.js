var assert = require("assert");
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

    it("should consolidate polls of all children to moo", function() {
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

/*
 console.log(JSON.stringify(consolidator.root, function(key, value) {
    if (key === "parent") {
        return "[circular]";
    } else {
        return value;
    }
}, "\t"));
*/
