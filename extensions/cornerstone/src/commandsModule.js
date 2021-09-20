import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import OHIF from '@ohif/core';
import Save from './SavePoints';
import setCornerstoneLayout from './utils/setCornerstoneLayout.js';
import { getEnabledElement } from './state';
import CornerstoneViewportDownloadForm from './CornerstoneViewportDownloadForm';
const scroll = cornerstoneTools.import('util/scroll');

const { studyMetadataManager } = OHIF.utils;
const { setViewportSpecificData } = OHIF.redux.actions;

const refreshCornerstoneViewports = () => {
  cornerstone.getEnabledElements().forEach(enabledElement => {
    if (enabledElement.image) {
      cornerstone.updateImage(enabledElement.element);
    }
  });
};

const commandsModule = ({ servicesManager }) => {
  const actions = {
    rotateViewport: ({ viewports, rotation }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        let viewport = cornerstone.getViewport(enabledElement);
        viewport.rotation += rotation;
        cornerstone.setViewport(enabledElement, viewport);
      }
    },
    flipViewportHorizontal: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        let viewport = cornerstone.getViewport(enabledElement);
        viewport.hflip = !viewport.hflip;
        cornerstone.setViewport(enabledElement, viewport);
      }
    },
    flipViewportVertical: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        let viewport = cornerstone.getViewport(enabledElement);
        viewport.vflip = !viewport.vflip;
        cornerstone.setViewport(enabledElement, viewport);
      }
    },
    scaleViewport: ({ direction, viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);
      const step = direction * 0.15;

      if (enabledElement) {
        if (step) {
          let viewport = cornerstone.getViewport(enabledElement);
          viewport.scale += step;
          cornerstone.setViewport(enabledElement, viewport);
        } else {
          cornerstone.fitToWindow(enabledElement);
        }
      }
    },
    resetViewport: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        cornerstone.reset(enabledElement);
      }
    },
    invertViewport: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        let viewport = cornerstone.getViewport(enabledElement);
        viewport.invert = !viewport.invert;
        cornerstone.setViewport(enabledElement, viewport);
      }
    },
    // TODO: this is receiving `evt` from `ToolbarRow`. We could use it to have
    //       better mouseButtonMask sets.
    setToolActive: ({ toolName }) => {
      if (!toolName) {
        console.warn('No toolname provided to setToolActive command');
      }
      cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
    },
    setToolActiePan: ({ toolName }) => {
      if (!toolName) {
        console.warn('No toolname provided to setToolActive command');
      }
      cornerstoneTools.setToolPassive('FreehandRoi', { mouseButtonMask: 1 });
      cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
    },
    setToolDisabled: ({ toolName }) => {
      if (!toolName) {
        console.warn('No toolname provided to setToolActive command');
      }
      cornerstoneTools.setToolPassive(toolName, { mouseButtonMask: 1 });
    },
    clearAnnotations: ({ viewports }) => {
      const element = getEnabledElement(viewports.activeViewportIndex);
      if (!element) {
        return;
      }

      const enabledElement = cornerstone.getEnabledElement(element);
      if (!enabledElement || !enabledElement.image) {
        return;
      }

      const {
        toolState,
      } = cornerstoneTools.globalImageIdSpecificToolStateManager;
      if (
        !toolState ||
        toolState.hasOwnProperty(enabledElement.image.imageId) === false
      ) {
        return;
      }

      const imageIdToolState = toolState[enabledElement.image.imageId];

      const measurementsToRemove = [];

      Object.keys(imageIdToolState).forEach(toolType => {
        const { data } = imageIdToolState[toolType];

        data.forEach(measurementData => {
          const {
            _id,
            lesionNamingNumber,
            measurementNumber,
          } = measurementData;
          if (!_id) {
            return;
          }

          measurementsToRemove.push({
            toolType,
            _id,
            lesionNamingNumber,
            measurementNumber,
          });
        });
      });

      measurementsToRemove.forEach(measurementData => {
        OHIF.measurements.MeasurementHandlers.onRemoved({
          detail: {
            toolType: measurementData.toolType,
            measurementData,
          },
        });
      });
    },
    nextImage: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);
      scroll(enabledElement, 1);
    },
    previousImage: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);
      scroll(enabledElement, -1);
    },
    getActiveViewportEnabledElement: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);
      return enabledElement;
    },
    showDownloadViewportModal: ({ title, viewports }) => {
      const activeViewportIndex = viewports.activeViewportIndex;
      const { UIModalService } = servicesManager.services;
      if (UIModalService) {
        UIModalService.show({
          content: CornerstoneViewportDownloadForm,
          title,
          contentProps: {
            activeViewportIndex,
            onClose: UIModalService.hide,
          },
        });
      }
    },
    updateTableWithNewMeasurementData({
      toolType,
      measurementNumber,
      location,
      description,
    }) {
      // Update all measurements by measurement number
      const measurementApi = OHIF.measurements.MeasurementApi.Instance;
      const measurements = measurementApi.tools[toolType].filter(
        m => m.measurementNumber === measurementNumber
      );

      measurements.forEach(measurement => {
        measurement.location = location;
        measurement.description = description;

        measurementApi.updateMeasurement(measurement.toolType, measurement);
      });

      measurementApi.syncMeasurementsAndToolData();

      refreshCornerstoneViewports();
    },
    getNearbyToolData({ element, canvasCoordinates, availableToolTypes }) {
      const nearbyTool = {};
      let pointNearTool = false;

      availableToolTypes.forEach(toolType => {
        const elementToolData = cornerstoneTools.getToolState(
          element,
          toolType
        );

        if (!elementToolData) {
          return;
        }

        elementToolData.data.forEach((toolData, index) => {
          let elementToolInstance = cornerstoneTools.getToolForElement(
            element,
            toolType
          );

          if (!elementToolInstance) {
            elementToolInstance = cornerstoneTools.getToolForElement(
              element,
              `${toolType}Tool`
            );
          }

          if (!elementToolInstance) {
            console.warn('Tool not found.');
            return undefined;
          }

          if (
            elementToolInstance.pointNearTool(
              element,
              toolData,
              canvasCoordinates
            )
          ) {
            pointNearTool = true;
            nearbyTool.tool = toolData;
            nearbyTool.index = index;
            nearbyTool.toolType = toolType;
          }
        });

        if (pointNearTool) {
          return false;
        }
      });

      return pointNearTool ? nearbyTool : undefined;
    },
    removeToolState: ({ element, toolType, tool }) => {
      cornerstoneTools.removeToolState(element, toolType, tool);
      cornerstone.updateImage(element);
    },
    setCornerstoneLayout: () => {
      setCornerstoneLayout();
    },
    setWindowLevel: ({ viewports, window, level }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);

      if (enabledElement) {
        let viewport = cornerstone.getViewport(enabledElement);

        viewport.voi = {
          windowWidth: Number(window),
          windowCenter: Number(level),
        };
        cornerstone.setViewport(enabledElement, viewport);
      }
    },
    jumpToImage: ({
      StudyInstanceUID,
      SOPInstanceUID,
      frameIndex,
      activeViewportIndex,
      refreshViewports = true,
    }) => {
      const study = studyMetadataManager.get(StudyInstanceUID);

      const displaySet = study.findDisplaySet(ds => {
        return (
          ds.images &&
          ds.images.find(i => i.getSOPInstanceUID() === SOPInstanceUID)
        );
      });

      if (!displaySet) {
        return;
      }

      displaySet.SOPInstanceUID = SOPInstanceUID;
      displaySet.frameIndex = frameIndex;

      window.store.dispatch(
        setViewportSpecificData(activeViewportIndex, displaySet)
      );

      if (refreshViewports) {
        refreshCornerstoneViewports();
      }
    },
    savePoints: ({ viewports }) => {
      const enabledElement = getEnabledElement(viewports.activeViewportIndex);
      if (enabledElement) {
        const stateStack = cornerstoneTools.getToolState(
          enabledElement,
          'stack'
        );
        const dataStack = stateStack.data[0].imageIds;
        // Going through the entire stack
        let FreeHandData = {
          SlicesFreeHand: [],
          SlicesPoint: [],
        };
        dataStack.forEach(function(item, i, dataStack) {
          let FreeHand = cornerstoneTools.globalImageIdSpecificToolStateManager.getImageIdToolState(
            item,
            'FreehandRoi'
          );
          if (FreeHand) {
            FreeHandData.SlicesFreeHand[i] = FreeHand.data;
          }
          let Point = cornerstoneTools.globalImageIdSpecificToolStateManager.getImageIdToolState(
            item,
            'Point'
          );
          if (Point) {
            FreeHandData.SlicesPoint[i] = Point.data;
          }
        });

        console.log(FreeHandData);
        // const Data = cornerstoneTools.globalImageIdSpecificToolStateManager.saveToolState();
        if (
          FreeHandData.SlicesFreeHand.length == 0 &&
          FreeHandData.SlicesPoint.length == 0
        ) {
          alert(
            'Сначала используйте инструменты "Поставить точку" или "Рисование от руки"'
          );
        } else {
          let jsonPoints = JSON.stringify(FreeHandData);
          Save(jsonPoints, 'data.json', 'text/plain');
        }
      } else return;
    },
  };

  const definitions = {
    jumpToImage: {
      commandFn: actions.jumpToImage,
      storeContexts: [],
      options: {},
    },
    getNearbyToolData: {
      commandFn: actions.getNearbyToolData,
      storeContexts: [],
      options: {},
    },
    removeToolState: {
      commandFn: actions.removeToolState,
      storeContexts: [],
      options: {},
    },
    updateTableWithNewMeasurementData: {
      commandFn: actions.updateTableWithNewMeasurementData,
      storeContexts: [],
      options: {},
    },
    showDownloadViewportModal: {
      commandFn: actions.showDownloadViewportModal,
      storeContexts: ['viewports'],
      options: {},
    },
    getActiveViewportEnabledElement: {
      commandFn: actions.getActiveViewportEnabledElement,
      storeContexts: ['viewports'],
      options: {},
    },
    rotateViewportCW: {
      commandFn: actions.rotateViewport,
      storeContexts: ['viewports'],
      options: { rotation: 90 },
    },
    rotateViewportCCW: {
      commandFn: actions.rotateViewport,
      storeContexts: ['viewports'],
      options: { rotation: -90 },
    },
    invertViewport: {
      commandFn: actions.invertViewport,
      storeContexts: ['viewports'],
      options: {},
    },
    flipViewportVertical: {
      commandFn: actions.flipViewportVertical,
      storeContexts: ['viewports'],
      options: {},
    },
    flipViewportHorizontal: {
      commandFn: actions.flipViewportHorizontal,
      storeContexts: ['viewports'],
      options: {},
    },
    scaleUpViewport: {
      commandFn: actions.scaleViewport,
      storeContexts: ['viewports'],
      options: { direction: 1 },
    },
    scaleDownViewport: {
      commandFn: actions.scaleViewport,
      storeContexts: ['viewports'],
      options: { direction: -1 },
    },
    fitViewportToWindow: {
      commandFn: actions.scaleViewport,
      storeContexts: ['viewports'],
      options: { direction: 0 },
    },
    resetViewport: {
      commandFn: actions.resetViewport,
      storeContexts: ['viewports'],
      options: {},
    },
    clearAnnotations: {
      commandFn: actions.clearAnnotations,
      storeContexts: ['viewports'],
      options: {},
    },
    nextImage: {
      commandFn: actions.nextImage,
      storeContexts: ['viewports'],
      options: {},
    },
    previousImage: {
      commandFn: actions.previousImage,
      storeContexts: ['viewports'],
      options: {},
    },
    // TOOLS
    setToolActive: {
      commandFn: actions.setToolActive,
      storeContexts: [],
      options: {},
    },
    setZoomTool: {
      commandFn: actions.setToolActive,
      storeContexts: [],
      options: { toolName: 'Zoom' },
    },
    setCornerstoneLayout: {
      commandFn: actions.setCornerstoneLayout,
      storeContexts: [],
      options: {},
      context: 'VIEWER',
    },
    setWindowLevel: {
      commandFn: actions.setWindowLevel,
      storeContexts: ['viewports'],
      options: {},
    },
    savePoints: {
      commandFn: actions.savePoints,
      storeContexts: ['viewports'],
      options: {},
    },
    setToolDisabled: {
      commandFn: actions.setToolDisabled,
      storeContexts: ['viewports'],
      options: {},
    },
    setToolActivePan: {
      commandFn: actions.setToolActiePan,
      storeContexts: ['viewports'],
      options: {},
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'ACTIVE_VIEWPORT::CORNERSTONE',
  };
};

export default commandsModule;
