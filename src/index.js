(function () {
  "use strict";

  // registers the extension on a cytoscape lib ref
  var register = function (cytoscape) {
    if (!cytoscape) {
      return;
    } // can't register if cytoscape unspecified
    var undoRedoUtilities = require("./undoRedoUtilities");
    var cueUtilities = require("./cueUtilities");
    const getSupportCy = require("./getSupportCy");
    const {
      runLayoutAsync,
      resolveCompoundNodesOverlap,
      getCiseClusterNodesExisitingInMap,
    } = require("./layoutUtilities");
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
          const srcId = edges[i].source().id();
          const targetId = edges[i].target().id();
          const obj = {};
          obj[srcId] = true;
          obj[targetId] = true;
          relatedEdgesArr.push(obj);
        }
        for (let i = 0; i < relatedEdgesArr.length; i++) {
          for (let j = i + 1; j < relatedEdgesArr.length; j++) {
            const keys1 = Object.keys(relatedEdgesArr[i]);
            const keys2 = Object.keys(relatedEdgesArr[j]);
            const allKeys = new Set(keys1.concat(keys2));
            if (allKeys.size != keys1.length || allKeys.size != keys2.length) {
              return false;
            }
          }
        }
        return true;
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

        if (hasGroupNodes) {
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
            var collapsedNodesCollection = supportCy.collection(supportNodes);
            expandCollapseUtilities.simpleCollapseGivenNodes(
              collapsedNodesCollection
            );

            // Get the layout options from the scratchpad
            var layoutBy = getScratch(cy, "options").layoutBy;

            // clusters of CISE layout
            var ciseClusters = getCiseClusterNodesExisitingInMap(
              supportCy,
              layoutBy?.clusters ?? []
            );

            // Run the layout asynchronously without animation
            await runLayoutAsync(
              supportCy.layout({
                ...layoutBy,
                clusters: ciseClusters,
                animate: false,
              })
            );

            // Resolve any compound nodes overlap without animation
            await resolveCompoundNodesOverlap(supportCy, {
              ...layoutBy,
              clusters: [],
              animate: false,
            });

            var positions = supportCy.nodes().map((node) => ({
              nodeId: node.id(),
              position: node.position(),
            }));

            // Destroy the support cytoscape instance
            supportCy.destroy();

            // Save the positions in the scratchpad
            setScratch(cy, "positions", positions);
          }
        }

        return expandCollapseUtilities.collapseGivenNodes(eles, tempOptions);
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
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        var hasGroupNodes = !!cy
          .nodes()
          .some((node) => node.data().type === "group");

        if (hasGroupNodes) {
          // Get the support cytoscape instance
          var supportCy = getSupportCy(cy);

          // Get the support node corresponding to the element to be expanded
          var supportNode = supportCy.getElementById(_eles.id());

          // Restore the collapsed children of the support node
          var restoredNodes = supportNode._private.data.collapsedChildren;
          supportCy.add(restoredNodes);

          // Update the classes of the support node to reflect its expanded state
          supportNode.toggleClass("cy-expand-collapse-collapsed-node", false);
          supportNode.toggleClass("collapsed", false);
          supportNode.toggleClass("expanded", true);

          // Get the layout options from the scratchpad
          var layoutBy = getScratch(cy, "options").layoutBy;

          // clusters of CISE layout
          var ciseClusters = getCiseClusterNodesExisitingInMap(
            supportCy,
            layoutBy?.clusters ?? []
          );

          // Run the layout asynchronously without animation
          await runLayoutAsync(
            supportCy.layout({
              ...layoutBy,
              clusters: ciseClusters,
              animate: false,
            })
          );

          // Resolve any compound nodes overlap without animation
          await resolveCompoundNodesOverlap(supportCy, {
            ...layoutBy,
            clusters: [],
            animate: false,
          });

          var positions = supportCy.nodes().map((node) => ({
            nodeId: node.id(),
            position: node.position(),
          }));

          // Destroy the support cytoscape instance
          supportCy.destroy();

          // Save the positions in the scratchpad
          setScratch(cy, "positions", positions);
        }

        var eles = this.expandableNodes(_eles);
        return expandCollapseUtilities.expandGivenNodes(eles, tempOptions);
      };

      // expand given eles recusively extend options with given param
      api.expandRecursively = function (_eles, opts) {
        var eles = this.expandableNodes(_eles);
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        return expandCollapseUtilities.expandAllNodes(eles, tempOptions);
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
      api.expandAll = function (opts) {
        var options = getScratch(cy, "options");
        var tempOptions = extendOptions(options, opts);
        evalOptions(tempOptions);

        return this.expandRecursively(this.expandableNodes(), tempOptions);
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
            const id1 = nodePair[1].id();
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
            const id1 = nodePair[1].id();
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
      api.updateCluster = async function (cluster) {
        await this.expand(cluster);
        await this.collapse(cluster);

        var collapsedChildren = this.getCollapsedChildren(cluster);
        var defaultNodesCount = collapsedChildren
          ? collapsedChildren.filter(
              (child) => child.data("type") === "default"
            ).length
          : "0";
        if (String(defaultNodesCount) === "0") {
          cy.remove(cluster);
        }

        cluster.data("childCount", defaultNodesCount);
      };

      api.expandCluster = function (nodeIds, clusterId) {
        const cluster = cy.getElementById(clusterId);

        var clusterEdge;
        cy.edges().forEach((edge) => {
          if (
            edge.data("source") === clusterId ||
            edge.data("target") === clusterId
          ) {
            clusterEdge = edge;
          }
        });

        var collapsedChildren = this.getCollapsedChildren(cluster);

        nodeIds.forEach((nodeId) => {
          var targetNode = collapsedChildren.find(
            (child) => child.data("id") === nodeId
          );
          targetNode.restore();
          targetNode.move({ parent: cluster.data("parent") ?? null });

          if (clusterEdge) {
            var targetEdgeData = { ...clusterEdge?.data() };
            var targetEdgeClasses = [...clusterEdge?.classes()];
            var targetEdgeId = targetEdgeData?.id?.split?.("_");

            if (targetEdgeData.source === cluster?.data?.()?.id) {
              targetEdgeId[0] = targetNode.data().id;
              targetEdgeData.source = targetNode.data().id;
            } else if (targetEdgeData?.target === cluster?.data?.()?.id) {
              targetEdgeId[2] = targetNode?.data?.()?.id;
              targetEdgeData.target = targetNode.data().id;
            }
            targetEdgeId = targetEdgeId?.join?.("_");
            targetEdgeData.id = targetEdgeId;

            cy.add({
              group: "edges",
              data: targetEdgeData,
              classes: targetEdgeClasses,
            });
          }
        });

        this.updateCluster(cluster);
      };

      api.collapseCluster = function (nodeIds, clusterId) {
        var cluster = cy.getElementById(clusterId);

        nodeIds.forEach((nodeId) => {
          const node = cy.getElementById(nodeId);
          node.move({ parent: clusterId });
        });

        this.updateCluster(cluster);
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
      const targetElement = document.querySelector(
        ".map.__________cytoscape_container"
      );
      const supportMapElement = document.getElementById("support-map");

      if (targetElement && !supportMapElement) {
        // Create a new div element
        const newElement = document.createElement("div");

        // Set the id attribute
        newElement.id = "support-map";

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
