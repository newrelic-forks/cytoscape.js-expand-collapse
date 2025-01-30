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
 * Organizes nodes by their parent groups at each level.
 *
 * @param {Array} nodes - An array of node objects. Each node should have a `data` method that returns an object containing `type` and `parent` properties.
 * @returns {Array} An array of objects, each representing a level. Each object contains:
 *   - `level` (number): The level number (1, 2, etc.).
 *   - `items` (Array): An array of node groups at that level. For level 1, all nodes are combined into a single group.
 */
function getNodesByGroupLevels(nodes) {
  // Create a map to store nodes by their parent group at each level
  const levelGroups = {};
  // Filter out default nodes and process each node
  const filteredNodes = nodes.filter((node) => node.data().type !== "default");

  // First, organize nodes by their parent groups
  filteredNodes.forEach((node) => {
    const parentId = node.data().parent;

    // Level 1 (root level)
    if (parentId === undefined) {
      if (!levelGroups[1]) {
        levelGroups[1] = {
          root: [],
        };
      }
      levelGroups[1].root.push(node);
    }
    // Other levels
    else {
      // Calculate level based on the number of '::' in the parent
      const level = parentId.split("::").length;

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
      level: level,
      items: Object.values(levelGroups[level]),
    }));

  return result ?? [];
}

function getExpandedNodeEdges(nodeId, cy) {
  const childNodeIds = new Set();
  cy.nodes().forEach((node) => {
    if (node.data().parent === nodeId) {
      childNodeIds.add(node.data().id);
    }
  });

  const childNodeExternalSourceEdges = new Set();
  const childNodeExternalTargetEdges = new Set();

  cy.edges().forEach((edge) => {
    const edgeId = edge?.data?.()?.id ?? "";
    const [source, type, target] = edgeId?.split("_");

    if (childNodeIds.has(source) && childNodeIds.has(target)) {
      // return;
    } else if (childNodeIds.has(source)) {
      childNodeExternalSourceEdges.add(edge);
    } else if (childNodeIds.has(target)) {
      childNodeExternalTargetEdges.add(edge);
    }
  });
  return {
    sourceEdges: childNodeExternalSourceEdges,
    targetEdges: childNodeExternalTargetEdges,
  };
}

const uniqueEdgesMap = new Map();
const addedEdgeIds = new Set();

function repairConnectedEdgesOfGroupNode(nodeId, cy) {
  let connectedEdges = cy.collection();

  cy.edges().forEach((edge) => {
    if (edge.data().source === nodeId || edge.data().target === nodeId) {
      const edgeId = edge?.data?.()?.id ?? "";
      const edgeType = edgeId?.split("_")[1];
      const groupEdgeId =
        edge.data().source + "_" + edgeType + "_" + edge.data().target;

      let uniqueEdges = [];
      if (!uniqueEdgesMap.has(groupEdgeId)) {
        uniqueEdges.push(edge);
      } else {
        if (!addedEdgeIds.has(edge.data().id)) {
          uniqueEdges = [...uniqueEdgesMap.get(groupEdgeId), edge];
          addedEdgeIds.add(edge.data().id);
        }
      }
      uniqueEdgesMap.set(groupEdgeId, uniqueEdges);
    }
  });

  return connectedEdges;
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
 * Resolves overlap of compound nodes in a cytoscape instance by temporarily replacing expanded nodes with positioning support nodes,
 * running the specified layout, and then restoring the original nodes.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Object} layoutBy - The layout options to be used for arranging the nodes.
 * @returns {Promise<void>} A promise that resolves when the layout has been applied and nodes have been restored.
 */
async function resolveCompoundNodesOverlap(cy, layoutBy) {
  const elementUtilities = require("./elementUtilities")(cy);
  const positioningSupportNodes = cy
    .nodes()
    .filter((node) => node.data().type === "positioning-support");

  if (positioningSupportNodes.length) {
    return;
  }
  const nodesByGroupLevels = getNodesByGroupLevels(cy.nodes());
  // console.log(cy.nodes());
  for (let i = 0; i < nodesByGroupLevels.length; i++) {
    let removedCollection = cy.collection();
    let positioningSupportCollection = cy.collection();
    let newGroupLevelNodesCollection = cy.collection();

    for (let j = 0; j < nodesByGroupLevels[i].items.length; j++) {
      const groupLevelNodes = nodesByGroupLevels[i].items[j];
      const newGroupLevelNodes = groupLevelNodes.map((node) => {
        //check if the node is expanded
        // console.log("node", node.data(), node.classes(), node.isParent());
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
          const { sourceEdges, targetEdges } = getExpandedNodeEdges(
            node.data().id,
            cy
          );
          console.log("sourceEdges", sourceEdges);
          console.log("targetEdges", targetEdges);

          cy.add(positioningSupportNode);
          console.log("positioningSupportNode", cy.edges().length);
          sourceEdges.forEach((edge) => {
            const edgeId = edge?.data?.()?.id ?? "";
            const [source, type, target] = edgeId?.split("_");
            const newEdgeId = `${positioningSupportNodeId}_${type}_${
              edge.data().target
            }`;

            if (!cy.getElementById(newEdgeId)?.length) {
              cy.add({
                group: "edges",
                data: {
                  ...edge.data(),
                  id: newEdgeId,
                  source: positioningSupportNodeId,
                  target: edge.data().target,
                },
                classes: [...edge.classes()],
              });
            }
          });

          targetEdges.forEach((edge) => {
            const edgeId = edge?.data?.()?.id ?? "";
            const [source, type, target] = edgeId?.split("_");
            const newEdgeId = `${
              edge.data().source
            }_${type}_${positioningSupportNodeId}`;
            if (!cy.getElementById(newEdgeId)?.length) {
              cy.add({
                group: "edges",
                data: {
                  ...edge.data(),
                  id: newEdgeId,
                  source: edge.data().source,
                  target: positioningSupportNodeId,
                },
                classes: [...edge.classes()],
              });
            }
          });
          console.log("positioningSupportNode", cy.edges().length);
          const removedNode = node.remove();
          removedCollection = removedCollection.union(removedNode);
          const newGroupLevelNode = cy.getElementById(positioningSupportNodeId);
          positioningSupportCollection =
            positioningSupportCollection.union(newGroupLevelNode);
          return newGroupLevelNode;
        }
        return node;
      });

      newGroupLevelNodesCollection =
        newGroupLevelNodesCollection.union(newGroupLevelNodes);
      newGroupLevelNodesCollection = newGroupLevelNodesCollection.union(
        newGroupLevelNodesCollection.connectedEdges()
      );
    }
    // console.log(
    //   "newGroupLevelNodesCollection1",
    //   newGroupLevelNodesCollection.length
    // );

    // If all nodes are collapsed
    if (removedCollection.length === 0 && nodesByGroupLevels.length === 1) {
      const reArrange = newGroupLevelNodesCollection.layout(layoutBy);

      await runLayoutAsync(reArrange);
    } else if (removedCollection.length > 0) {
      const reArrange = newGroupLevelNodesCollection.layout(layoutBy);

      await runLayoutAsync(reArrange);

      removedCollection.restore();
      removedCollection.forEach((removedNode) => {
        if (
          removedNode.group() !== "edges" ||
          removedNode.data()?.type === "default"
        ) {
          const positioningSupportNodeId = `support ${removedNode.data().id}`;
          const positioningSupportNode = cy.getElementById(
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
      positioningSupportCollection.remove();
    }
  }
}

module.exports = {
  runLayoutAsync,
  resolveCompoundNodesOverlap,
  getCiseClusterNodesExisitingInMap,
};
