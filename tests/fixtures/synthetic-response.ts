// Invented construction and IDs for testing only; not manufacturer catalog data.
export const syntheticEntry = {
  templateName: "SYNTHETIC-4L",
  showName: "Synthetic display label",
  impedanceTemplateCode: "synthetic-code-1",
  stencilLayer: 4,
  stencilPly: 1.2,
  cuprumThickness: 1,
  insideCuprumThickness: 0.5,
  compressionThickness: 1.15,
  enableFlag: true,
  defaultFlag: false,
  expeditedFlag: false,
  delamination: false,
  innerLayerCoverlay: false,
  plateType: 1,
  laminationType: 1,
  sort: 1,
  fixedFee: 0,
  coefficient: 0,
  pricePanelFixedFeeVO: { fixedFeeFlag: null, fixedFeeFlagBatch: null },
  iaminationList: [
    {
      iaminationType: 1,
      contentKey: "synthetic-1",
      sort: 1,
      content: {
        LineThickness: "0.04mm",
        LineLayer: "Top Layer",
        lineMaterialType: "Copper",
      },
    },
    {
      iaminationType: 2,
      contentKey: "synthetic-2",
      sort: 2,
      content: {
        preThickness: "0.20mm",
        preMaterialType: "synthetic-glass*2",
        preLayer: "Prepreg",
      },
    },
    {
      iaminationType: 3,
      contentKey: "synthetic-3",
      sort: 3,
      content: {
        coreBoardThickness1: "0.02mm",
        coreBoardThickness2: "0.63mm",
        coreBoardThickness3: "0.02mm",
        coreBoardLayer1: "Inner Layer L2",
        coreBoardLayer2: "Core",
        coreBoardLayer3: "Inner Layer L3",
        coreBoardMaterialType1: "Copper",
        coreBoardMaterialType2: "Core",
        coreBoardMaterialType3: "Copper",
        coreBoardRemark: "Synthetic core description",
      },
    },
    {
      iaminationType: 2,
      contentKey: "synthetic-4",
      sort: 4,
      content: {
        preThickness: "0.20mm",
        preMaterialType: "synthetic-glass*2",
        preLayer: "Prepreg",
      },
    },
    {
      iaminationType: 1,
      contentKey: "synthetic-5",
      sort: 5,
      content: {
        LineThickness: "0.04mm",
        LineLayer: "Bottom Layer",
        lineMaterialType: "Copper",
      },
    },
  ],
}

export function syntheticResponse(entries: unknown[] = [syntheticEntry]) {
  return JSON.stringify({
    success: true,
    code: 200,
    message: null,
    errorCode: null,
    data: entries,
  })
}
