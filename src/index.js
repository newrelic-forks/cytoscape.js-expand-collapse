(function () {
  "use strict";

  // registers the extension on a cytoscape lib ref
  var register = function (cytoscape) {
    if (!cytoscape) {
      return;
    } // can't register if cytoscape unspecified
    var undoRedoUtilities = require("./undoRedoUtilities");
    var cueUtilities = require("./cueUtilities");
    var getSupportCy = require("./getSupportCy");
    var { repairEdges } = require("./edgeUtilities");
    var { resolveCompoundNodesOverlap } = require("./layoutUtilities");
    var saveLoadUtils = null;

    function extendOptions(options, extendBy) {
      var tempOpts = {};
      for (var key in options) tempOpts[key] = options[key];

      for (var key in extendBy)
        if (tempOpts.hasOwnProperty(key)) tempOpts[key] = extendBy[key];
      return tempOpts;
    }

    // evaluate some specific options in case of they are specified as functions to be dynamically changed
    function evalOptions(options) {
      var animate =
        typeof options.animate === "function"
          ? options.animate.call()
          : options.animate;
      var fisheye =
        typeof options.fisheye === "function"
          ? options.fisheye.call()
          : options.fisheye;

      options.animate = animate;
      options.fisheye = fisheye;
    }

    // creates and returns the API instance for the extension
    function createExtensionAPI(cy, expandCollapseUtilities) {
      var api = {}; // API to be returned
      // set functions

      function handleNewOptions(opts) {
        var currentOpts = getScratch(cy, "options");
        if (opts.cueEnabled && !currentOpts.cueEnabled) {
          api.enableCue();
        } else if (!opts.cueEnabled && currentOpts.cueEnabled) {
          api.disableCue();
        }
      }

      function isOnly1Pair(edges) {
        let relatedEdgesArr = [];
        for (let i = 0; i < edges.length; i++) {
          var srcId = edges[i].source().id();
          var targetId = edges[i].target().id();
          var obj = {};
          obj[srcId] = true;
          obj[targetId] = true;
          relatedEdgesArr.push(obj);
        }
        for (let i = 0; i < relatedEdgesArr.length; i++) {
          for (let j = i + 1; j < relatedEdgesArr.length; j++) {
            var keys1 = Object.keys(relatedEdgesArr[i]);
            var keys2 = Object.keys(relatedEdgesArr[j]);
            var allKeys = new Set(keys1.concat(keys2));
            if (allKeys.size != keys1.length || allKeys.size != keys2.length) {
              return false;
            }
          }
        }
        return true;
      }

      async function supportEndOperation(supportCy) {
        // Get the layout options from the scratchpad
        var layoutBy = getScratch(cy, "options").layoutBy;
        var groupLayoutBy = getScratch(cy, "options").groupLayoutBy;
        var customLayout = getScratch(cy, "options").customLayout;

        repairEdges(supportCy);

        supportCy.nodes().forEach((node) => {
          if (node.data("type") === "group" && node.isParent()) {
            node.toggleClass("support-expanded", true);
          }
        });

        // Resolve any compound nodes overlap without animation
        await resolveCompoundNodesOverlap(
          supportCy,
          {
            ...layoutBy,
            animate: false,
          },
          { ...groupLayoutBy, animate: false },
          customLayout
        );

        var positions = supportCy.nodes().map((node) => ({
          nodeId: node.id(),
          position: node.position(),
        }));

        // Destroy the support cytoscape instance
        supportCy.destroy();

        // Save the positions in the scratchpad
        setScratch(cy, "positions", positions);
      }

      async function supportCollapse(eles) {
        // Get the support cytoscape instance
        var supportCy = getSupportCy(cy);

        // Get the support nodes corresponding to the elements to be collapsed
        var supportNodes = eles.map((ele) => {
          var supportNode = supportCy.getElementById(ele.id());
          supportNode.toggleClass("expanded", false);
          supportNode.toggleClass("cy-expand-collapse-collapsed-node", true);
          supportNode.toggleClass("collapsed", true);
          return supportNode;
        });

        if (supportNodes.length) {
          // Collapse the support nodes

          var collapseNodesCollection = supportCy.collection(supportNodes);

          var supportExpandCollapseUtilities =
            require("./expandCollapseUtilities")(supportCy);
          await supportExpandCollapseUtilities.simpleCollapseGivenNodes(
            collapseNodesCollection
          );

          await supportEndOperation(supportCy);
        }
      }

      async function supportExpandRecursively(eles) {
        // Get the support cytoscape instance
        var supportCy = getSupportCy(cy);

        var supportGroupNodesCollection = supportCy.collection();

        supportCy.nodes().forEach((supportNode) => {
          if (supportNode.data().type === "group") {
            supportNode.toggleClass("cy-expand-collapse-collapsed-node", false);
            supportNode.toggleClass("collapsed", false);
            supportNode.toggleClass("expanded", true);
            supportGroupNodesCollection =
              supportGroupNodesCollection.union(supportNode);
          }
        });

        var supportExpandCollapseUtilities =
          require("./expandCollapseUtilities")(supportCy);

        await supportExpandCollapseUtilities.simpleExpandAllNodes(
          undefined,
          false,
          true
        );

        await supportEndOperation(supportCy);
      }

      async function supportExpand(eles) {
        // Get the support cytoscape instance
        var supportCy = getSupportCy(cy);

        // Get the support nodes corresponding to the elements to be collapsed
        var supportNodes = eles.map((ele) => {
          var supportNode = supportCy.getElementById(ele.id());
          supportNode.toggleClass("cy-expand-collapse-collapsed-node", false);
          supportNode.toggleClass("collapsed", false);
          supportNode.toggleClass("expanded", true);
          return supportNode;
        });

        if (supportNodes.length) {
          // Expand the support nodes

          var expandNodesCollection = supportCy.collection(supportNodes);

          var supportExpandCollapseUtilities =
            require("./expandCollapseUtilities")(supportCy);

          await supportExpandCollapseUtilities.simpleExpandGivenNodes(
            expandNodesCollection,
            false
          );

          await supportEndOperation(supportCy);
        }
      }

      // set all options at once
      api.setOptions = function (opts) {
        handleNewOptions(opts);
        setScratch(cy, "options", opts);
      };

      api.extendOptions = function (opts) {
        var options = getScratch(cy, "options");
        var newOptions = extendOptions(options, opts);
        handleNewOptions(newOptions);
        setScratch(cy, "options", newOptions);
      };

      // set the option whose name is given
      api.setOption = function (name, value) {
        var opts = {};
        opts[name] = value;

        var options = getScratch(cy, "options");
        var newOptions = extendOptions(options, opts);

        handleNewOptions(newOptions);
        setScratch(cy, "options", newOptions);
      };

      // Collection functions

      // collapse given eles extend options with given param
      api.collapse = async function (_eles, opts) {
        var eles = this.collapsibleNodes(_eles);
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        var hasGroupNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");

        if (hasGroupNodes && tempOptions?.groupLayoutBy?.name !== "dagre") {
          await supportCollapse(eles);
        }

        setScratch(cy, "tempOptions", tempOptions);

        const result = await expandCollapseUtilities.collapseGivenNodes(
          eles,
          tempOptions
        );

        return result;
      };

      // collapse given eles recursively extend options with given param
      api.collapseRecursively = async function (_eles, opts) {
        var eles = this.collapsibleNodes(_eles);
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);
        var result = await this.collapse(
          eles.union(eles.descendants()),
          tempOptions
        );

        return result;
      };

      // expand given eles extend options with given param
      api.expand = async function (_eles, opts) {
        var eles = this.expandableNodes(_eles);
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        var hasGroupNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");

        if (hasGroupNodes && tempOptions?.groupLayoutBy?.name !== "dagre") {
          await supportExpand(eles);
        }

        setScratch(cy, "tempOptions", tempOptions);

        const result = await expandCollapseUtilities.expandGivenNodes(
          eles,
          tempOptions
        );

        return result;
      };

      // expand given eles recusively extend options with given param
      api.expandRecursively = async function (eles, opts) {
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        var hasGroupNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");

        if (hasGroupNodes && tempOptions?.groupLayoutBy?.name !== "dagre") {
          await supportExpandRecursively(eles);
        }

        setScratch(cy, "tempOptions", tempOptions);

        const result = await expandCollapseUtilities.expandAllNodes(
          eles,
          tempOptions
        );

        return result;
      };

      // Core functions

      // collapse all collapsible nodes
      api.collapseAll = async function (opts) {
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        var result = await this.collapseRecursively(
          this.collapsibleNodes(),
          tempOptions
        );

        return result;
      };

      // expand all expandable nodes
      api.expandAll = async function (opts) {
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        setScratch(cy, "tempOptions", tempOptions);

        const result = await this.expandRecursively(
          this.expandableNodes(),
          tempOptions
        );

        return result;
      };

      api.savePositionsWithAllGroupsExpanded = async function () {
        var groupNodes = cy.nodes().filter((node) => {
          return node.data().type === "group";
        });

        if (groupNodes.length) {
          await supportExpandRecursively(groupNodes);
          var finalPositions = {};
          (cy?.scratch("_cyExpandCollapse")?.positions ?? []).forEach(
            ({ nodeId, position }) => {
              finalPositions[nodeId] = position;
            }
          );

          setScratch(cy, "finalPositions", finalPositions);

          return finalPositions;
        }
      };

      // Utility functions

      // returns if the given node is expandable
      api.isExpandable = function (node) {
        return node.hasClass("cy-expand-collapse-collapsed-node");
      };

      // returns if the given node is collapsible
      api.isCollapsible = function (node) {
        return !this.isExpandable(node) && node.isParent();
      };

      // get collapsible ones inside given nodes if nodes parameter is not specified consider all nodes
      api.collapsibleNodes = function (_nodes) {
        var self = this;
        var nodes = _nodes ? _nodes : cy.nodes();
        return nodes.filter(function (ele, i) {
          if (typeof ele === "number") {
            ele = i;
          }
          return self.isCollapsible(ele);
        });
      };

      // get expandable ones inside given nodes if nodes parameter is not specified consider all nodes
      api.expandableNodes = function (_nodes) {
        var self = this;
        var nodes = _nodes ? _nodes : cy.nodes();
        return nodes.filter(function (ele, i) {
          if (typeof ele === "number") {
            ele = i;
          }
          return self.isExpandable(ele);
        });
      };

      // Get the children of the given collapsed node which are removed during collapse operation
      api.getCollapsedChildren = function (node) {
        return node.data("collapsedChildren");
      };

      /** Get collapsed children recursively including nested collapsed children
       * Returned value includes edges and nodes, use selector to get edges or nodes
       * @param node : a collapsed node
       * @return all collapsed children
       */
      api.getCollapsedChildrenRecursively = function (node) {
        var collapsedChildren = cy.collection();
        return expandCollapseUtilities.getCollapsedChildrenRecursively(
          node,
          collapsedChildren
        );
      };

      /** Get collapsed children of all collapsed nodes recursively including nested collapsed children
       * Returned value includes edges and nodes, use selector to get edges or nodes
       * @return all collapsed children
       */
      api.getAllCollapsedChildrenRecursively = function () {
        var collapsedChildren = cy.collection();
        var collapsedNodes = cy.nodes(".cy-expand-collapse-collapsed-node");
        var j;
        for (j = 0; j < collapsedNodes.length; j++) {
          collapsedChildren = collapsedChildren.union(
            this.getCollapsedChildrenRecursively(collapsedNodes[j])
          );
        }
        return collapsedChildren;
      };
      // This method forces the visual cue to be cleared. It is to be called in extreme cases
      api.clearVisualCue = function (node) {
        cy.trigger("expandcollapse.clearvisualcue");
      };

      api.disableCue = function () {
        var options = getScratch(cy, "options");
        if (options.cueEnabled) {
          cueUtilities("unbind", cy, api);
          options.cueEnabled = false;
        }
      };

      api.enableCue = function () {
        var options = getScratch(cy, "options");
        if (!options.cueEnabled) {
          cueUtilities("rebind", cy, api);
          options.cueEnabled = true;
        }
      };

      api.getParent = function (nodeId) {
        if (cy.getElementById(nodeId)[0] === undefined) {
          var parentData = getScratch(cy, "parentData");
          return parentData[nodeId];
        } else {
          return cy.getElementById(nodeId).parent();
        }
      };

      api.collapseEdges = function (edges, opts) {
        var result = { edges: cy.collection(), oldEdges: cy.collection() };
        if (edges.length < 2) return result;
        if (!isOnly1Pair(edges)) return result;
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        return expandCollapseUtilities.collapseGivenEdges(edges, tempOptions);
      };

      api.expandEdges = function (edges) {
        var result = { edges: cy.collection(), oldEdges: cy.collection() };
        if (edges === undefined) return result;

        //if(typeof edges[Symbol.iterator] === 'function'){//collection of edges is passed
        edges.forEach(function (edge) {
          var operationResult = expandCollapseUtilities.expandEdge(edge);
          result.edges = result.edges.add(operationResult.edges);
          result.oldEdges = result.oldEdges.add(operationResult.oldEdges);
        });
        /*  }else{//one edge passed
           var operationResult = expandCollapseUtilities.expandEdge(edges);
           result.edges = result.edges.add(operationResult.edges);
           result.oldEdges = result.oldEdges.add(operationResult.oldEdges);
           
         } */
        return result;
      };

      api.collapseEdgesBetweenNodes = function (nodes, opts) {
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        function pairwise(list) {
          var pairs = [];
          list.slice(0, list.length - 1).forEach(function (first, n) {
            var tail = list.slice(n + 1, list.length);
            tail.forEach(function (item) {
              pairs.push([first, item]);
            });
          });
          return pairs;
        }
        var nodesPairs = pairwise(nodes);
        // for self-loops
        nodesPairs.push(...nodes.map((x) => [x, x]));
        var result = { edges: cy.collection(), oldEdges: cy.collection() };
        nodesPairs.forEach(
          function (nodePair) {
            var id1 = nodePair[1].id();
            var edges = nodePair[0].connectedEdges(
              '[source = "' + id1 + '"],[target = "' + id1 + '"]'
            );
            // edges for self-loops
            if (nodePair[0].id() === id1) {
              edges = nodePair[0].connectedEdges(
                '[source = "' + id1 + '"][target = "' + id1 + '"]'
              );
            }
            if (edges.length >= 2) {
              var operationResult = expandCollapseUtilities.collapseGivenEdges(
                edges,
                tempOptions
              );
              result.oldEdges = result.oldEdges.add(operationResult.oldEdges);
              result.edges = result.edges.add(operationResult.edges);
            }
          }.bind(this)
        );

        return result;
      };

      api.expandEdgesBetweenNodes = function (nodes) {
        var edgesToExpand = cy.collection();
        function pairwise(list) {
          var pairs = [];
          list.slice(0, list.length - 1).forEach(function (first, n) {
            var tail = list.slice(n + 1, list.length);
            tail.forEach(function (item) {
              pairs.push([first, item]);
            });
          });
          return pairs;
        }
        var nodesPairs = pairwise(nodes);
        // for self-loops
        nodesPairs.push(...nodes.map((x) => [x, x]));
        nodesPairs.forEach(
          function (nodePair) {
            var id1 = nodePair[1].id();
            var edges = nodePair[0].connectedEdges(
              '.cy-expand-collapse-collapsed-edge[source = "' +
                id1 +
                '"],[target = "' +
                id1 +
                '"]'
            );
            // edges for self-loops
            if (nodePair[0].id() === id1) {
              edges = nodePair[0].connectedEdges(
                '[source = "' + id1 + '"][target = "' + id1 + '"]'
              );
            }
            edgesToExpand = edgesToExpand.union(edges);
          }.bind(this)
        );
        return this.expandEdges(edgesToExpand);
      };

      api.collapseAllEdges = function (opts) {
        return this.collapseEdgesBetweenNodes(
          cy.edges().connectedNodes(),
          opts
        );
      };

      api.expandAllEdges = function () {
        var edges = cy.edges(".cy-expand-collapse-collapsed-edge");
        var result = { edges: cy.collection(), oldEdges: cy.collection() };
        var operationResult = this.expandEdges(edges);
        result.oldEdges = result.oldEdges.add(operationResult.oldEdges);
        result.edges = result.edges.add(operationResult.edges);
        return result;
      };

      api.loadJson = function (jsonStr) {
        saveLoadUtils.loadJson(jsonStr);
      };

      api.saveJson = function (elems, filename) {
        return saveLoadUtils.saveJson(elems, filename);
      };

      // api for cluster operations
      api.updateCluster = async function (
        cluster,
        clusterColorClassesPriorities,
        opts = {}
      ) {
        await this.expand(cluster, {
          ...opts,
          allowReArrangeLayout: false,
        });
        await this.collapse(cluster, opts);

        var collapsedChildren = this.getCollapsedChildren(cluster);
        var defaultNodesCount = collapsedChildren
          ? collapsedChildren.filter(
              (child) => child.data("type") === "default"
            ).length
          : "0";
        if (String(defaultNodesCount) === "0") {
          cluster.style({ display: "none" });
          return;
        } else {
          cluster.style({ display: "element" });
        }

        function updateClusterNodeColor() {
          var clusterColorClass = clusterColorClassesPriorities?.find(
            (colorClass) => {
              return collapsedChildren
                ?.filter((child) => child.data("type") === "default")
                ?.find((node) => [...node?.classes()]?.includes(colorClass));
            }
          );

          if (
            clusterColorClassesPriorities?.length > 0 &&
            !!clusterColorClass
          ) {
            cluster.removeClass(clusterColorClassesPriorities);
            cluster.addClass(clusterColorClass);
          }
        }

        cluster.data("childCount", defaultNodesCount);
        updateClusterNodeColor();
      };

      api.expandCluster = async function (
        nodeIds,
        clusterId,
        clusterColorClassesPriorities,
        opts
      ) {
        var cluster = cy.getElementById(clusterId);
        var collapsedChildren = this.getCollapsedChildren(cluster);

        nodeIds.forEach((nodeId) => {
          var targetNode = collapsedChildren.find(
            (child) => child.data("id") === nodeId
          );
          targetNode.restore();
          targetNode.move({ parent: cluster.data("parent") ?? null });
        });

        await this.updateCluster(cluster, clusterColorClassesPriorities, opts);
      };

      api.collapseCluster = async function (
        nodeIds,
        clusterId,
        clusterColorClassesPriorities,
        opts
      ) {
        var cluster = cy.getElementById(clusterId);

        nodeIds.forEach((nodeId) => {
          var node = cy.getElementById(nodeId);
          node.move({ parent: clusterId });
        });

        await this.updateCluster(cluster, clusterColorClassesPriorities, opts);
      };

      return api; // Return the API instance
    }

    // Get the whole scratchpad reserved for this extension (on an element or core) or get a single property of it
    function getScratch(cyOrEle, name) {
      if (cyOrEle.scratch("_cyExpandCollapse") === undefined) {
        cyOrEle.scratch("_cyExpandCollapse", {});
      }

      var scratch = cyOrEle.scratch("_cyExpandCollapse");
      var retVal = name === undefined ? scratch : scratch[name];
      return retVal;
    }

    // Set a single property on scratchpad of an element or the core
    function setScratch(cyOrEle, name, val) {
      getScratch(cyOrEle)[name] = val;
    }

    // register the extension cy.expandCollapse()
    cytoscape("core", "expandCollapse", function (opts) {
      var cy = this;

      // Create Support-Map Container
      // Select the element with the class name "map __________cytoscape_container"
      var targetElement = document.querySelector(
        ".map.__________cytoscape_container"
      );
      var supportMapElement = document.getElementById(opts?.supportMapId);

      if (targetElement && !supportMapElement) {
        // Create a new div element
        var newElement = document.createElement("div");

        // Set the id attribute
        newElement.id = opts?.supportMapId;

        // Set the style properties
        newElement.style.zIndex = -1;
        newElement.style.opacity = 0;

        // Insert the new element as a sibling after the target element
        targetElement.parentNode.insertBefore(
          newElement,
          targetElement.nextSibling
        );
      }

      var options = getScratch(cy, "options") || {
        layoutBy: null, // for rearrange after expand/collapse. It's just layout options or whole layout function. Choose your side!
        groupLayoutBy: null, // for rearrange group nodes after expand/collapse. It's just layout options or whole layout function. Choose your side!
        fisheye: true, // whether to perform fisheye view after expand/collapse you can specify a function too
        animate: true, // whether to animate on drawing changes you can specify a function too
        animationDuration: 1000, // when animate is true, the duration in milliseconds of the animation
        ready: function () {}, // callback when expand/collapse initialized
        undoable: true, // and if undoRedoExtension exists,

        cueEnabled: true, // Whether cues are enabled
        expandCollapseCuePosition: "top-left", // default cue position is top left you can specify a function per node too
        expandCollapseCueSize: 12, // size of expand-collapse cue
        expandCollapseCueLineSize: 8, // size of lines used for drawing plus-minus icons
        expandCueImage: undefined, // image of expand icon if undefined draw regular expand cue
        collapseCueImage: undefined, // image of collapse icon if undefined draw regular collapse cue
        expandCollapseCueSensitivity: 1, // sensitivity of expand-collapse cues

        edgeTypeInfo: "edgeType", //the name of the field that has the edge type, retrieved from edge.data(), can be a function
        groupEdgesOfSameTypeOnCollapse: false,
        allowNestedEdgeCollapse: true,
        zIndex: 999, // z-index value of the canvas in which cue ımages are drawn
        layoutHandler: function () {}, // layout function to be called after expand/collapse
        allowReArrangeLayout: true, // whether to rearrange layout after expand/collapse
        customLayout: false, // whether to use custom layout
        shouldSaveFinalPositions: false, // whether to save final positions of all nodes; when all groups are expanded
        avoidExpandingClusters: true, // whether to include clusters in the expandAll operation
        supportMapId: "",
      };

      // If opts is not 'get' that is it is a real options object then initilize the extension
      if (opts !== "get") {
        options = extendOptions(options, opts);

        var expandCollapseUtilities = require("./expandCollapseUtilities")(cy);
        var api = createExtensionAPI(cy, expandCollapseUtilities); // creates and returns the API instance for the extension
        saveLoadUtils = require("./saveLoadUtilities")(cy, api);
        setScratch(cy, "api", api);

        undoRedoUtilities(cy, api);

        cueUtilities(options, cy, api);

        // if the cue is not enabled unbind cue events
        if (!options.cueEnabled) {
          cueUtilities("unbind", cy, api);
        }

        if (options.ready) {
          options.ready();
        }

        setScratch(cy, "options", options);

        var parentData = {};
        setScratch(cy, "parentData", parentData);
      }

      return getScratch(cy, "api"); // Expose the API to the users
    });
  };

  if (typeof module !== "undefined" && module.exports) {
    // expose as a commonjs module
    module.exports = register;
  }

  if (typeof define !== "undefined" && define.amd) {
    // expose as an amd/requirejs module
    define("cytoscape-expand-collapse", function () {
      return register;
    });
  }

  if (typeof cytoscape !== "undefined") {
    // expose to global cytoscape (i.e. window.cytoscape)
    register(cytoscape);
  }
})();
