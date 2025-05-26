const getSupportCy = require("./getSupportCy");
const { repairEdges } = require("./edgeUtilities");

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
 * Generates layout options based on the provided parameters.
 *
 * @param {Object} layoutBy - The default layout configuration.
 * @param {Object} groupLayoutBy - The layout configuration for group nodes.
 * @param {boolean} isAnyNodeGroup - A flag indicating if any node is part of a group.
 * @returns {Object} The computed layout options.
 */
function getLayoutOptions(
  layoutBy,
  groupLayoutBy,
  isAnyNodeGroup,
  groupLevel,
  customLayout
) {
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
  return {
    ...layoutOptions,
    rankDir: customLayout && groupLevel === 3 ? "LR" : "TB",
    nodeSep: customLayout && groupLevel === 3 ? 10 : layoutOptions.nodeSep,
    rankSep: customLayout && groupLevel === 3 ? 10 : layoutOptions.rankSep,
  };
}

/**
 * Creates a configuration object for a preset layout.
 *
 * @param {object} layoutBy - The base layout configuration.
 * @param {object} positions - The positions to apply to the nodes.
 * @returns {object} The complete preset layout configuration.
 */
function createPresetLayoutConfig(layoutBy, positions) {
  return {
    name: "preset",
    fit: !!layoutBy?.fit,
    positions,
    padding: layoutBy?.padding ?? 50,
    animate: !!layoutBy?.animate,
    animationDuration: layoutBy?.animationDuration ?? 500,
    animationEasing: layoutBy?.animationEasing,
  };
}

/**
 * Extracts node positions from a Cytoscape instance.
 *
 * @param {object} cy - The Cytoscape instance to extract positions from.
 * @returns {object} An object mapping node IDs to their positions.
 */
function getPositionsFromCy(cy) {
  const positions = {};
  cy.nodes().forEach((node) => {
    positions[node.id()] = node.position();
  });
  return positions;
}

/**
 * Handles the layout for a graph with no group nodes.
 *
 * @param {object} cy - The Cytoscape instance.
 * @param {object} expandCollapseOptions - The expand/collapse extension options.
 */
async function handleLayoutWithoutGroups(cy, expandCollapseOptions) {
  const supportCy = getSupportCy(cy);
  repairEdges(supportCy);
  await runLayoutAsync(supportCy.layout(expandCollapseOptions.layoutBy));

  const finalPositions = getPositionsFromCy(supportCy);
  const presetLayout = createPresetLayoutConfig(
    expandCollapseOptions.layoutBy,
    finalPositions
  );
  await runLayoutAsync(cy.layout(presetLayout));
  supportCy.destroy();
}

/**
 * Handles the layout for group nodes using a preset layout.
 *
 * @param {object} cy - The Cytoscape instance.
 * @param {object} expandCollapseOptions - The expand/collapse extension options.
 */
async function handleNonDagreLayoutWithGroups(cy, expandCollapseOptions) {
  const positions = (expandCollapseOptions?.positions ?? []).reduce(
    (acc, { nodeId, position }) => {
      acc[nodeId] = position;
      return acc;
    },
    {}
  );

  const presetLayout = createPresetLayoutConfig(
    expandCollapseOptions.groupLayoutBy,
    positions
  );
  await runLayoutAsync(cy.layout(presetLayout));
}

/**
 * Handles the layout for group nodes using a dagre layout.
 *
 * @param {object} cy - The Cytoscape instance.
 */
async function handleDagreLayoutWithGroups(cy) {
  const finalPositions = cy.scratch("_cyExpandCollapse")?.finalPositions ?? {};
  const supportCy = getSupportCy(cy);
  const elementUtilities = require("./elementUtilities")(supportCy);
  const nodesByGroupLevels = getNodesByGroupLevels(supportCy);

  nodesByGroupLevels.forEach((level) => {
    level.items.forEach((nodes) => {
      nodes.forEach((node) => {
        const newPosition = finalPositions[node.id()];
        if (node.data("type") === "group" && node.isParent()) {
          node.toggleClass("support-expanded", true);
          const oldPosition = node.position();
          elementUtilities.moveCompoundNode(node, oldPosition, newPosition);
        } else {
          node.position(newPosition);
        }
      });
    });
  });
  adjustDagreLayoutWithSeparation(supportCy);

  const supportFinalPositions = getPositionsFromCy(supportCy);
  const presetLayout = createPresetLayoutConfig(
    cy.scratch("_cyExpandCollapse").tempOptions.groupLayoutBy,
    supportFinalPositions
  );
  await runLayoutAsync(cy.layout(presetLayout));
  supportCy.destroy();
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
  if (node.data("type") === "group" && node.isParent()) {
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
    if (childNode.data("type") === "group" && childNode.isParent()) {
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
    if (node.data("type") === "group" && node.isParent()) {
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
 * Resolves overlap of compound nodes in a cytoscape instance by temporarily replacing expanded nodes with positioning support nodes,
 * running the specified layout, and then restoring the original nodes.
 *
 * @param {Object} supportCy - The Supoort Cytoscape instance.
 * @param {Object} layoutBy - The layout options to be used for arranging the nodes.
 * @returns {Promise<void>} A promise that resolves when the layout has been applied and nodes have been restored.
 */
async function resolveCompoundNodesOverlap(
  supportCy,
  layoutBy,
  groupLayoutBy,
  customLayout
) {
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
        if (node.data("type") === "group" && node.isParent()) {
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
        isAnyNodeGroup,
        nodesByGroupLevels[i].level,
        customLayout
      );

      const reArrange = groupLevelNodesEdgesCollection.layout(layoutOptions);
      await runLayoutAsync(reArrange);

      // Restore the original nodes
      removedCollection.restore();

      // Move the children of the removed nodes to their parent positions
      removedCollection.forEach((removedNode) => {
        if (removedNode?.data("type") === "group" && removedNode?.isParent()) {
          const positioningSupportNode = supportCy.getElementById(
            `support ${removedNode.data().id}`
          );
          if (positioningSupportNode?.length) {
            elementUtilities.moveCompoundNode(
              removedNode,
              removedNode.position(),
              positioningSupportNode.position()
            );
          }
        }
      });
      // remove support nodes after moving actual nodes
      positioningSupportCollection.remove();
    }
  }
}

function adjustDagreLayoutWithSeparation(cy) {
  const elementUtilities = require("./elementUtilities")(cy);
  const nodesByGroupLevels = getNodesByGroupLevels(cy);
  const customLayout =
    cy.scratch("_cyExpandCollapse")?.tempOptions?.customLayout;
  const originalRankDir =
    cy.scratch("_cyExpandCollapse")?.tempOptions?.groupLayoutBy?.rankDir;
  const originalNodeSep =
    cy.scratch("_cyExpandCollapse")?.tempOptions?.groupLayoutBy?.nodeSep;
  const originalRankSep =
    cy.scratch("_cyExpandCollapse")?.tempOptions?.groupLayoutBy?.rankSep;
  let rankDir = originalRankDir;
  let nodeSep = originalNodeSep;
  let rankSep = originalRankSep;

  const levelMaps = [];
  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    levelMaps[i] = []; // Initialize the inner array for each level
    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      const nodes = nodesByGroupLevels[i].items[j];
      const groupLevel = nodesByGroupLevels[i].level;

      if (customLayout && groupLevel === 3) {
        rankDir === "TB" ? "LR" : "TB";
      } else {
        rankDir = originalRankDir;
      }
      // Group the nodes by their original coordinate (y for TB, x for LR)
      const coordMap = new Map();
      nodes.forEach((node) => {
        const coord =
          rankDir === "TB" ? node.position("y") : node.position("x");
        if (!coordMap.has(coord)) {
          coordMap.set(coord, []);
        }
        coordMap.get(coord).push(node);
      });
      levelMaps[i][j] = coordMap;
    }
  }

  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      const groupLevel = nodesByGroupLevels[i].level;

      if (customLayout && groupLevel === 3) {
        rankDir === "TB" ? "LR" : "TB";
        nodeSep = 10;
        rankSep = 10;
      } else {
        rankDir = originalRankDir;
        nodeSep = originalNodeSep;
        rankSep = originalRankSep;
      }
      const coordMap = levelMaps[i][j];

      // Convert to sorted array of levels (rows or columns)
      const sortedLevels = Array.from(coordMap.entries()).sort(
        (a, b) => a[0] - b[0]
      );

      // Adjust positioning for each level
      sortedLevels.forEach((currentLevelData, levelIndex) => {
        const currentLevelNodes = currentLevelData[1];

        // Calculate total dimension needed for this level (width for TB, height for LR)
        const totalDimension = currentLevelNodes.reduce((sum, node) => {
          const nodeDimension =
            node.data().type !== "group"
              ? rankDir === "TB"
                ? node.width()
                : node.height()
              : rankDir === "TB"
              ? node.boundingBox().w
              : node.boundingBox().h;
          return sum + nodeDimension;
        }, 0);
        const totalSeparation = (currentLevelNodes.length - 1) * nodeSep;

        // Starting position to center the level
        let currentStartCoord = -((totalDimension + totalSeparation) / 2);

        // Determine main coordinate (y for TB, x for LR)
        let currentMainCoord;
        if (levelIndex === 0) {
          // For first level, use original coordinate
          currentMainCoord = currentLevelData[0];
        } else {
          const prevLevelData = sortedLevels[levelIndex - 1];
          const prevLevelNodes = prevLevelData[1];

          // Calculate max end of previous level
          const maxPrevLevelEnd = Math.max(
            ...prevLevelNodes.map(
              (node) =>
                (node.data().type !== "group"
                  ? rankDir === "TB"
                    ? node.height()
                    : node.width()
                  : rankDir === "TB"
                  ? node.boundingBox().h
                  : node.boundingBox().w) / 2
            )
          );

          // Calculate max start of current level
          const maxCurrentLevelStart = Math.max(
            ...currentLevelNodes.map(
              (node) =>
                (node.data().type !== "group"
                  ? rankDir === "TB"
                    ? node.height()
                    : node.width()
                  : rankDir === "TB"
                  ? node.boundingBox().h
                  : node.boundingBox().w) / 2
            )
          );

          // Calculate current level's new main coordinate
          currentMainCoord =
            (rankDir === "TB"
              ? prevLevelNodes[0].position("y")
              : prevLevelNodes[0].position("x")) +
            maxPrevLevelEnd +
            rankSep +
            maxCurrentLevelStart;
        }

        // Position nodes in the current level
        currentLevelNodes.forEach((node) => {
          const nodeDimension =
            node.data().type !== "group"
              ? rankDir === "TB"
                ? node.width()
                : node.height()
              : rankDir === "TB"
              ? node.boundingBox().w
              : node.boundingBox().h;

          const newPosition = {};
          if (rankDir === "TB") {
            newPosition.x = currentStartCoord + nodeDimension / 2;
            newPosition.y = currentMainCoord;
          } else {
            newPosition.x = currentMainCoord;
            newPosition.y = currentStartCoord + nodeDimension / 2;
          }

          if (node.data("type") === "group" && node.isParent()) {
            const oldPosition = node.position();
            elementUtilities.moveCompoundNode(node, oldPosition, newPosition);
          } else {
            node.position(newPosition);
          }

          // Move currentStartCoord for next node
          currentStartCoord += nodeDimension + nodeSep;
        });
      });
    }
  }
}

module.exports = {
  runLayoutAsync,
  resolveCompoundNodesOverlap,
  adjustDagreLayoutWithSeparation,
  getNodesByGroupLevels,
  handleLayoutWithoutGroups,
  handleNonDagreLayoutWithGroups,
  handleDagreLayoutWithGroups,
};
