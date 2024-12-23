const cytoscape = require("cytoscape");
const fcose = require("cytoscape-fcose");
const dagre = require("cytoscape-dagre");

/**
 * Creates a new support cytoscape instance with the same elements and style as the provided instance,
 * and attaches it to a container with the ID "support-map".
 *
 * @param {Object} cy - The original Cytoscape instance.
 * @returns {Object} The new Cytoscape instance.
 */
function getSupportCy(cy) {
  const cyJson = cy.json();

  let cont = document.getElementById("support-map");
  cont.style.width = cy.container().clientWidth + "px";
  cont.style.height = cy.container().clientHeight + "px";

  cytoscape.use(fcose);
  cytoscape.use(dagre);
  const supportCy = cytoscape({
    container: cont,
    elements: cyJson.elements,
    styleEnabled: true,
    style: cyJson.style,
  });

  return supportCy;
}

module.exports = getSupportCy;
