/**
 * Filters out nodes from ciseClusters that do not exist in the given Cytoscape instance.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Array} ciseClusters - An array of clusters, where each cluster is an array of node IDs.
 * @returns {Array} An array of updated clusters, containing only the node IDs that exist in the Cytoscape instance.
 */
function getCiseClusterNodesExisitingInMap(cy, ciseClusters) {
  const updatedClusters = [];
  ciseClusters.forEach((cluster) => {
    const updatedCluster = [];

    cluster.forEach((nodeId) => {
      if (cy.getElementById(nodeId).length) {
        updatedCluster.push(nodeId);
      }
    });

    if (updatedCluster.length) {
      updatedClusters.push(updatedCluster);
    }
  });
  return updatedClusters;
}

/**
 * Runs the given layout asynchronously and returns a promise that resolves when the layout stops.
 *
 * @param {Object} layout - The layout object that has an `on` method to listen for events and a `run` method to start the layout.
 * @returns {Promise<void>} A promise that resolves when the layout stops.
 */
function runLayoutAsync(layout) {
  return new Promise((resolve) => {
    layout.on("layoutstop", resolve);
    layout.run();
  });
}

/**
 * Organizes nodes by their parent groups at each level.
 *
 * @param {Array} nodes - An array of node objects. Each node should have a `data` method that returns an object containing `type` and `parent` properties.
 * @returns {Array} An array of objects, each representing a level. Each object contains:
 *   - `level` (number): The level number (1, 2, etc.).
 *   - `items` (Array): An array of node groups at that level. For level 1, all nodes are combined into a single group.
 */
function getNodesByGroupLevels(cy) {
  // Create a map to store nodes by their parent group at each level
  const levelGroups = {};

  const nodes = cy.nodes();

  // First, organize nodes by their parent groups
  nodes.forEach((node) => {
    const parentId = node.data().parent;

    // Level 1 (root level)
    if (parentId === undefined) {
      if (!levelGroups[1]) {
        levelGroups[1] = {
          root: [],
        };
      }
      levelGroups[1].root.push(node);
    } else {
      // Calculate level based on the parentId
      let level = 1;
      let currentNode = node;

      // Traverse up the hierarchy to determine the level
      while (currentNode.data().parent !== undefined) {
        level++;
        const parentNodeId = currentNode.data().parent;
        currentNode = cy.getElementById(parentNodeId);
        if (!currentNode) break; // Break if parent node is not found
      }

      if (!levelGroups[level]) {
        levelGroups[level] = {};
      }

      // Group by parent
      if (!levelGroups[level][parentId]) {
        levelGroups[level][parentId] = [];
      }
      levelGroups[level][parentId].push(node);
    }
  });

  // Convert the level groups to the required output format
  const result = Object.keys(levelGroups)
    .sort((a, b) => parseInt(b) - parseInt(a))
    .map((level) => ({
      level: parseInt(level),
      items: Object.values(levelGroups[level]),
    }));

  return result ?? [];
}

/**
 * Retrieves the edge ID with a specified prefix if the node is expanded and is a parent.
 *
 * @param {string} id - The ID of the edge.
 * @param {string} parentId - The ID of the parent node.
 * @param {Object} cy - The Cytoscape instance.
 * @param {string} [prefix="support"] - The prefix to add to the edge ID if conditions are met.
 * @returns {string} - The edge ID with the prefix if the node is expanded and is a parent, otherwise the original edge ID.
 */
function getEdgeIdWithPrefix(id, parentId, cy, prefix = "support") {
  const edgeId = getEdgeOutermostId(id, parentId, cy);
  const node = cy.getElementById(edgeId);
  if (!node.hasClass("cy-expand-collapse-collapsed-node") && node.isParent()) {
    return `${prefix} ${edgeId}`;
  }
  return edgeId;
}

/**
 * Recursively finds the outermost parent node ID for a given node ID within a specified parent context.
 *
 * @param {string} id - The ID of the node to start the search from.
 * @param {string} parentId - The ID of the parent node to compare against.
 * @param {Object} cy - The Cytoscape instance used to retrieve elements.
 * @returns {string|undefined} - The ID of the outermost parent node if found, otherwise undefined.
 */
function getEdgeOutermostId(id, parentId, cy) {
  const node = cy.getElementById(id);
  if (node.parent()?.id() === parentId) {
    return id;
  }
  if (node.parent()?.id() === undefined) {
    return;
  }
  return getEdgeOutermostId(node.parent()?.id(), parentId, cy);
}

/**
 * Recursively retrieves the innermost child nodes of a given node in a Cytoscape instance.
 *
 * @param {string} id - The ID of the node to start the search from.
 * @param {Object} cy - The Cytoscape instance.
 * @returns {Object} A collection of the innermost child nodes.
 */
function getInnerMostChildNodes(id, cy) {
  const node = cy.getElementById(id);
  const childNodes = node.children();
  let nonExpandedChildNodes = cy.collection();

  childNodes.forEach((childNode) => {
    if (
      !childNode.hasClass("cy-expand-collapse-collapsed-node") &&
      childNode.isParent()
    ) {
      nonExpandedChildNodes = nonExpandedChildNodes.union(
        getInnerMostChildNodes(childNode.id(), cy)
      );
    } else {
      nonExpandedChildNodes = nonExpandedChildNodes.union(childNode);
    }
  });
  return nonExpandedChildNodes;
}

/**
 * Retrieves the edges of support expanded groups within a Cytoscape instance.
 *
 * @param {Array} groupLevelNodes - An array of group level nodes.
 * @param {Object} cy - The Cytoscape instance.
 * @returns {Map} A Map of edges of support expanded groups.
 */
function getSupportExpandedGroupsEdges(groupLevelNodes, cy) {
  const expandedGroupNodes = groupLevelNodes.filter((node) => {
    if (
      !node.hasClass("cy-expand-collapse-collapsed-node") &&
      node.isParent()
    ) {
      return node;
    }
  });
  const supportExpandedGroupsEdges = new Map();
  expandedGroupNodes.forEach((node) => {
    const parentId = node.data().parent;
    const childNodes = getInnerMostChildNodes(node.id(), cy);
    const childNodeIds = new Set();
    childNodes.forEach((childNode) => {
      childNodeIds.add(childNode.data().id);
    });

    const childEdges = childNodes.connectedEdges();

    childEdges.forEach((edge) => {
      const sourceId = edge.data().source;
      const targetId = edge.data().target;
      const isOutboundEdge =
        childNodeIds.has(sourceId) && !childNodeIds.has(targetId);
      const isInboundEdge =
        childNodeIds.has(targetId) && !childNodeIds.has(sourceId);
      if (!isInboundEdge && !isOutboundEdge) {
        return;
      }
      let edgeId = "";
      let source = "";
      let target = "";
      let label = "";
      if (isOutboundEdge) {
        const edgeTargetId = getEdgeIdWithPrefix(targetId, parentId, cy);
        edgeId = edgeTargetId
          ? `support ${node.id()}_${edge.data().label}_${edgeTargetId}`
          : "";
        source = `support ${node.id()}`;
        target = edgeTargetId;
        label = edge.data().label;
      }
      if (isInboundEdge) {
        const edgeSourceId = getEdgeIdWithPrefix(sourceId, parentId, cy);
        edgeId = edgeSourceId
          ? `${edgeSourceId}_${edge.data().label}_support ${node.id()}`
          : "";
        source = edgeSourceId;
        target = `support ${node.id()}`;
        label = edge.data().label;
      }
      if (edgeId && !supportExpandedGroupsEdges.has(edgeId)) {
        supportExpandedGroupsEdges.set(edgeId, {
          id: edgeId,
          source,
          target,
          label,
        });
      }
    });
  });
  return supportExpandedGroupsEdges;
}

/**
 * Retrieves the edges of support non-expanded nodes within a Cytoscape instance.
 *
 * @param {Array} groupLevelNodes - An array of group level nodes.
 * @param {Object} cy - The Cytoscape instance.
 * @returns {Object} A collection of edges of support non-expanded nodes.
 */
function getSupportNonExpandedGroupsEdges(groupLevelNodes, cy) {
  let nonExpandedGroupsNodes = cy.collection();
  const nonExpandedGroupsNodesIds = new Set();
  groupLevelNodes.forEach((node) => {
    if (!node.isParent()) {
      nonExpandedGroupsNodesIds.add(node.data().id);
      nonExpandedGroupsNodes = nonExpandedGroupsNodes.union(node);
    }
  });

  const supportNonExpandedGroupsEdges = new Map();
  nonExpandedGroupsNodes.connectedEdges().forEach((edge) => {
    const sourceId = edge.data().source;
    const targetId = edge.data().target;
    const label = edge.data().label;
    if (
      nonExpandedGroupsNodesIds.has(sourceId) &&
      nonExpandedGroupsNodesIds.has(targetId)
    ) {
      const edgeId = `${sourceId}_${label}_${targetId}`;
      if (!supportNonExpandedGroupsEdges.has(edgeId)) {
        supportNonExpandedGroupsEdges.set(edgeId, edge);
      }
    }
  });

  let supportNonExpandedGroupsEdgesCollection = cy.collection();
  supportNonExpandedGroupsEdges.forEach((edge) => {
    supportNonExpandedGroupsEdgesCollection =
      supportNonExpandedGroupsEdgesCollection.union(edge);
  });

  return supportNonExpandedGroupsEdgesCollection;
}

/**
 * Generates layout options based on the provided parameters.
 *
 * @param {Object} layoutBy - The default layout configuration.
 * @param {Object} groupLayoutBy - The layout configuration for group nodes.
 * @param {boolean} isAnyNodeGroup - A flag indicating if any node is part of a group.
 * @returns {Object} The computed layout options.
 */
function getLayoutOptions(layoutBy, groupLayoutBy, isAnyNodeGroup) {
  let layoutOptions;
  if (groupLayoutBy && isAnyNodeGroup) {
    layoutOptions = {
      ...groupLayoutBy,
      cols: groupLayoutBy?.compoundCols ?? groupLayoutBy?.cols,
      rows: groupLayoutBy?.compoundRows ?? groupLayoutBy?.rows,
    };
  } else if (isAnyNodeGroup) {
    layoutOptions = {
      ...layoutBy,
      cols: layoutBy?.compoundCols ?? layoutBy?.cols,
      rows: layoutBy?.compoundRows ?? layoutBy?.rows,
    };
  } else {
    layoutOptions = {
      ...layoutBy,
      cols: layoutBy?.cols,
      rows: layoutBy?.rows,
    };
  }
  return layoutOptions;
}

/**
 * Resolves overlap of compound nodes in a cytoscape instance by temporarily replacing expanded nodes with positioning support nodes,
 * running the specified layout, and then restoring the original nodes.
 *
 * @param {Object} supportCy - The Supoort Cytoscape instance.
 * @param {Object} layoutBy - The layout options to be used for arranging the nodes.
 * @returns {Promise<void>} A promise that resolves when the layout has been applied and nodes have been restored.
 */
async function resolveCompoundNodesOverlap(supportCy, layoutBy, groupLayoutBy) {
  const elementUtilities = require("./elementUtilities")(supportCy);
  const nodesByGroupLevels = getNodesByGroupLevels(supportCy);

  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    let isAnyNodeGroup = false;
    // Adding support nodes for expanded groups to each group level
    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      let removedCollection = supportCy.collection();
      let positioningSupportCollection = supportCy.collection();
      let groupLevelNodesEdgesCollection = supportCy.collection();

      const groupLevelNodesOfAGroup = nodesByGroupLevels[i].items[j];
      const supportExpandedGroupsEdges = getSupportExpandedGroupsEdges(
        groupLevelNodesOfAGroup,
        supportCy
      );
      const newGroupLevelNodesOfAGroup = groupLevelNodesOfAGroup.map((node) => {
        //check if the node is expanded
        if (node.isNode() && node.data().type === "group") {
          isAnyNodeGroup = true;
        }
        if (
          !node.hasClass("cy-expand-collapse-collapsed-node") &&
          node.isParent()
        ) {
          const positioningSupportNodeId = `support ${node.data().id}`;
          const positioningSupportNode = {
            group: "nodes",
            data: {
              id: positioningSupportNodeId,
              parent: node.data().parent,
              type: "positioning-support",
              label: `${node.data().label}`,
            },
            style: {
              width: node.boundingBox().w,
              height: node.boundingBox().h,
              padding: 0,
              "min-width": 0,
              "border-width": 0,
              shape: "round-rectangle",
            },
            position: {
              x: node.position("x"),
              y: node.position("y"),
            },
          };

          supportCy.add(positioningSupportNode);

          const removedNode = node.remove();
          removedCollection = removedCollection.union(removedNode);
          const newGroupLevelNode = supportCy.getElementById(
            positioningSupportNodeId
          );
          positioningSupportCollection =
            positioningSupportCollection.union(newGroupLevelNode);
          return newGroupLevelNode;
        }
        return node;
      });

      groupLevelNodesEdgesCollection = groupLevelNodesEdgesCollection.union(
        newGroupLevelNodesOfAGroup
      );

      // Adding edges into collection for support non-expanded nodes
      const supportNonExpandedGroupsEdges = getSupportNonExpandedGroupsEdges(
        groupLevelNodesEdgesCollection,
        supportCy
      );
      groupLevelNodesEdgesCollection = groupLevelNodesEdgesCollection.union(
        supportNonExpandedGroupsEdges
      );

      // Adding edges into collection for support expanded groups
      supportExpandedGroupsEdges.forEach(({ id, source, target, label }) => {
        supportCy.add({
          group: "edges",
          data: {
            id,
            source,
            target,
            label,
          },
        });
        groupLevelNodesEdgesCollection = groupLevelNodesEdgesCollection.union(
          supportCy.getElementById(id)
        );
      });

      // Run the layout with support nodes and edges
      const layoutOptions = getLayoutOptions(
        layoutBy,
        groupLayoutBy,
        isAnyNodeGroup
      );

      const reArrange = groupLevelNodesEdgesCollection.layout(layoutOptions);
      await runLayoutAsync(reArrange);

      // Restore the original nodes
      removedCollection.restore();

      // Move the children of the removed nodes to their parent positions
      removedCollection.forEach((removedNode) => {
        if (
          removedNode.group() !== "edges" ||
          removedNode.data()?.type === "default"
        ) {
          const positioningSupportNodeId = `support ${removedNode.data().id}`;
          const positioningSupportNode = supportCy.getElementById(
            positioningSupportNodeId
          );
          if (positioningSupportNode?.length) {
            // Determine the multiplier based on the relative positions of removedNode and positioningSupportNode
            const multiplier = {
              x:
                removedNode.position().x < positioningSupportNode.position().x
                  ? 1
                  : -1,
              y:
                removedNode.position().y < positioningSupportNode.position().y
                  ? 1
                  : -1,
            };

            // Calculate the difference in positions, adjusted by the multiplier
            const positionDiff = {
              x:
                multiplier.x === 1
                  ? positioningSupportNode.position().x -
                    removedNode.position().x
                  : (removedNode.position().x -
                      positioningSupportNode.position().x) *
                    -1,
              y:
                multiplier.y === 1
                  ? positioningSupportNode.position().y -
                    removedNode.position().y
                  : (removedNode.position().y -
                      positioningSupportNode.position().y) *
                    -1,
            };

            // Move the children of removedNode by the calculated position difference
            elementUtilities.moveNodes(
              positionDiff,
              removedNode.children(),
              undefined
            );
          }
        }
      });
      // remove support nodes
      positioningSupportCollection.remove();
    }
  }
}

function adjustDagreLayoutWithSeparation(cy, nodeSep = 100, rankSep = 100) {
  const elementUtilities = require("./elementUtilities")(cy);
  const nodesByGroupLevels = getNodesByGroupLevels(cy);

  cy.nodes().forEach((node) => {
    if (node.data("type") === "group" && node.isParent()) {
      node.toggleClass("support-expanded", true);
    }
  });

  const rowMaps = [];
  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    rowMaps[i] = []; // Initialize the inner array for each level
    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      const nodes = nodesByGroupLevels[i].items[j];
      // Group the nodes by their original y-coordinate (rows)
      const rowMap = new Map();
      nodes.forEach((node) => {
        const y = node.position("y");
        if (!rowMap.has(y)) {
          rowMap.set(y, []);
        }
        rowMap.get(y).push(node);
      });
      rowMaps[i][j] = rowMap;
    }
  }

  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      // Group the nodes by their original y-coordinate (rows)
      const rowMap = rowMaps[i][j];

      // Convert to sorted array of rows
      const sortedRows = Array.from(rowMap.entries()).sort(
        (a, b) => a[0] - b[0]
      );

      // Adjust positioning for each row
      sortedRows.forEach((currentRowData, rowIndex) => {
        const currentRowNodes = currentRowData[1];

        // Calculate total width needed for this row
        const totalWidth = currentRowNodes.reduce((sum, node) => {
          const nodeWidth =
            node.data().type !== "group" ? node.width() : node.boundingBox().w;
          return sum + nodeWidth;
        }, 0);
        const totalSeparation = (currentRowNodes.length - 1) * nodeSep;

        // Starting x position to center the row
        let currentX = -((totalWidth + totalSeparation) / 2);

        // Determine y-position
        let currentRowY;
        if (rowIndex === 0) {
          // For first row, use original y-coordinate
          currentRowY = currentRowData[0];
        } else {
          const prevRowData = sortedRows[rowIndex - 1];
          const prevRowNodes = prevRowData[1];

          // Calculate max bottom of previous row
          const maxPrevRowBottom = Math.max(
            ...prevRowNodes.map(
              (node) =>
                (node.data().type !== "group"
                  ? node.height()
                  : node.boundingBox().h) / 2
            )
          );

          // Calculate max top of current row
          const maxCurrentRowTop = Math.max(
            ...currentRowNodes.map(
              (node) =>
                (node.data().type !== "group"
                  ? node.height()
                  : node.boundingBox().h) / 2
            )
          );

          // Calculate current row's new y-position
          currentRowY =
            prevRowNodes[0].position("y") +
            maxPrevRowBottom +
            rankSep +
            maxCurrentRowTop;
        }

        // Position nodes in the current row
        currentRowNodes.forEach((node) => {
          const nodeWidth =
            node.data().type !== "group" ? node.width() : node.boundingBox().w;

          if (
            !node.hasClass("cy-expand-collapse-collapsed-node") &&
            node.isParent()
          ) {
            const oldPosition = node.position();
            const newPosition = {
              x: currentX + nodeWidth / 2,
              y: currentRowY,
            };
            const multiplier = {
              x: oldPosition.x < newPosition.x ? 1 : -1,
              y: oldPosition.y < newPosition.y ? 1 : -1,
            };

            // Calculate the difference in positions, adjusted by the multiplier
            const positionDiff = {
              x:
                multiplier.x === 1
                  ? newPosition.x - oldPosition.x
                  : (oldPosition.x - newPosition.x) * -1,
              y:
                multiplier.y === 1
                  ? newPosition.y - oldPosition.y
                  : (oldPosition.y - newPosition.y) * -1,
            };

            elementUtilities.moveNodes(
              positionDiff,
              node.children(),
              undefined
            );
          } else {
            node.position({
              x: currentX + nodeWidth / 2,
              y: currentRowY,
            });
          }

          // Move currentX for next node
          currentX += nodeWidth + nodeSep;
        });
      });
    }
  }
}

module.exports = {
  runLayoutAsync,
  resolveCompoundNodesOverlap,
  getCiseClusterNodesExisitingInMap,
  adjustDagreLayoutWithSeparation,
};
