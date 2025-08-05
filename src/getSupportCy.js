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

  let cont = document.getElementById(
    cy.scratch("_cyExpandCollapse")?.options?.supportMapId
  );
  cont.style.width = cy.container().clientWidth + "px";
  cont.style.height = cy.container().clientHeight + "px";

  cytoscape.use(fcose);
  cytoscape.use(dagre);

  const supportCyStyle = cyJson.style.map((item) => {
    const newItem = { ...item };
    if (newItem.style) {
      delete newItem.style["line-gradient-stop-colors"];
      delete newItem.style["line-gradient-stop-positions"];
    }
    return newItem;
  });

  const supportCy = cytoscape({
    container: cont,
    elements: cyJson.elements,
    styleEnabled: true,
    style: supportCyStyle,
  });

  var scratchPad = cy.scratch("_cyExpandCollapse") ?? {};
  supportCy.scratch("_cyExpandCollapse", {
    ...scratchPad,
    parentData: { ...(scratchPad?.parentData ?? {}) },
    options: {
      ...(scratchPad?.options ?? {}),
      allowReArrangeLayout: false,
    },
    tempOptions: {
      ...(scratchPad?.tempOptions ?? {}),
      allowReArrangeLayout: false,
    },
  });

  return supportCy;
}

module.exports = getSupportCy;
