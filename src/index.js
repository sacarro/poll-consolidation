var EventEmitter = require("events").EventEmitter;
var util = require("util");

function Consolidator() {

    EventEmitter.call(this);

    /**
     * The rate at which a consolidated request will
     * be polled at.
     *
     * @type {Number}
     */
    Object.defineProperty(this, "defaultPollRate", {
        value: 1000,
        enumerable: true,
        writeable: true
    });


    /**
     * The root nodes that make up the targets currently being polled.
     */
    Object.defineProperty(this, "root", {
        value: {
            children: {}
        }
    });


    /**
     * The current list of poll targets.
     */
    Object.defineProperty(this, "pollTargets", {
        value: []
    });

}

util.inherits(Consolidator, EventEmitter);


Consolidator.prototype._createNode = function(name, path, parent) {
    var newNode = {
        name: name,
        path: path,
        parent: parent,
        children: {},
        poll: false,
        emit: false
    };

    if (parent) {
        parent.children[name] = newNode;
    }

    return newNode;
};

Consolidator.prototype._ensureTree = function(pathParts, fullPath, parentNode) {
    var path = pathParts.shift();
    var nFullPath = fullPath.substr(fullPath.indexOf("/"));
    if (!parentNode) {
        parentNode = this.root;
    }

    var node = parentNode.children[path];
    if (!node) {
        node = this._createNode(path, fullPath.substr(0, fullPath.indexOf(path) + path.length), parentNode);
    }

    if (!pathParts.length) {
        node.emit = true;
        node.poll = true;
        return node;
    } else {
        return this._ensureTree(pathParts, fullPath.substr(fullPath.indexOf("/")), node);
    }
};

Consolidator.prototype._stopAllPolling = function(node) {

    for (var cId in node.children) {
        this._stopAllPolling(node.children[cId]);
    }
    var idx = this.pollTargets.indexOf(node.path);
    if (idx > -1) {
        this.pollTargets.splice(idx, 1);
    }
    node.poll = false;

};

Consolidator.prototype._consolidate = function(node) {

    var getConsolidatorNode = function(node) {

        if (!node) {
            return null;
        }

        var cPoint = null;
        var childIds = Object.keys(node.children);
        if ((childIds.length === 1 && node.emit) || childIds.length > 1) {
            cPoint = node;
        }

        var pCPoint = getConsolidatorNode(node.parent);
        if (pCPoint) {
            cPoint = pCPoint;
        }

        return cPoint;
    };

    // I want to consolidate at this node level,
    // and at all the levels above this node.
    // The highest consolidation point determined should
    // then call the stopAllPolling on all its children.
    var consolidationNode = getConsolidatorNode(node);
    if (consolidationNode) {
        for (var cId in consolidationNode.children) {
            this._stopAllPolling(consolidationNode.children[cId]);
        }
        consolidationNode.poll = true;
    }

};

Consolidator.prototype.poll = function(target, rateOverride) {

    // Make sure all the pieces of the path are in the tree
    var node = this._ensureTree(target.split("/"), target);

    // Now walk back up the tree to see what can be consolidated
    this._consolidate(node);
};

module.exports.Consolidator = Consolidator;
