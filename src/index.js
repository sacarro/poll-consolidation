var EventEmitter = require("events").EventEmitter;
var util = require("util");
var http = require("http");
var async = require("async");

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

Consolidator.prototype._ensureTree = function(pathParts, fullPath, rate, parentNode) {
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
        node.rate = rate;
        this._addPolling(node);
        return node;
    } else {
        return this._ensureTree(pathParts, fullPath.substr(fullPath.indexOf("/")), rate, node);
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

Consolidator.prototype._addPolling = function(node) {
    node.poll = true;
    var idx = this.pollTargets.indexOf(node.path);
    if (idx === -1) {
        this.pollTargets.push(node.path);
        this._pollTarget(node.path, node.rate);
    }
};

Consolidator.prototype._consolidate = function(node) {

    var getConsolidatorNode = function getConsolidatorNode(node) {

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
            // Math.min produces NaN when passed an undefined variable
            if (node.rate === undefined) {
                minRate = pCPoint.rate;
            } else if (pCPoint.rate === undefined) {
                minRate = node.rate;
            } else {
                minRate = Math.min(node.rate, pCPoint.rate);
            }
            cPoint = pCPoint;
            cPoint.rate = minRate;
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
        this._addPolling(consolidationNode);
    }

    return consolidationNode;

};

Consolidator.prototype._pollTarget = function(target, rate) {

    var callback = function pollDataReceived(err, data) {
        if (err) {
            this.emit("error", err);
        } else {
            this.emit("data", data);
        }
    }.bind(this);

    console.log("POLLING", target);
    var req = http.request({
        method: "GET",
        host: this.host,
        path: target
    }, function(res) {
        var body = "";
        res.on("data", function responseDataReceived(data) {
            body += data;
        });
        res.on("end", function responseComplete() {
            // Only pass up the data and poll again if target still alive 
            if (this.pollTargets.indexOf(target) > -1) {
                if (res.statusCode !== 200) {
                    callback(res);
                } else {
                    callback(null, {
                        origin: target,
                        data: body
                    });
                }

                // Ok
                setTimeout(function repoll() {
                    if (this && this._pollTarget) {
                        this._pollTarget(target, rate);
                    }
                }.bind(this), rate);
            }
        }.bind(this));
    }.bind(this));

    req.on("error", function requestError(err) {
        callback(err);
    });
    req.end();
};

Consolidator.prototype.poll = function(target, rate) {

    var pathParts = target.split("/");
    pathParts.shift(); // split inserts a '' at the beginning of the array

    // Make sure all the pieces of the path are in the tree
    var node = this._ensureTree(pathParts, target, rate || 500);

    // Now walk back up the tree to see what can be consolidated
    this._consolidate(node);

};

module.exports.Consolidator = Consolidator;
