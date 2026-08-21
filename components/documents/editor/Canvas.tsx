"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { resolvePageSize, type DocumentElement, type DocumentPage } from "@/convex/documents/spec";
import {
  PX_PER_MM,
  elementCorners,
  normalizeAngle,
  resizeBox,
  snapAngle,
  type HandleId,
  type RotatedBox,
} from "@/lib/documents/geometry";
import { collectSnapTargets, snapBox, snapToGrid, type SnapGuide } from "@/lib/documents/snap";
import type { EditorAction, EditorState } from "@/lib/documents/editorState";
import type { TokenMap } from "@/lib/documents/tokens";
import { ElementView } from "./ElementView";
import { SelectionOverlay } from "./SelectionOverlay";

const GRID_MM = 5;
const NUDGE_MM = 0.5;
const BIG_NUDGE_MM = 5;
const SNAP_THRESHOLD_PX = 6;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP_IN = 1.1;
const ZOOM_STEP_OUT = 0.9;
const ROTATE_STEP_DEG = 15;
/** 45° magnet applies when the raw angle is within this distance of a multiple of 45°. */
const ROTATE_MAGNET_THRESHOLD_DEG = 5;
const MIDDLE_MOUSE_BUTTON = 1;
/** Breathing room around the page when computing fit-to-screen zoom. */
const FIT_PADDING_PX = 80;

interface Point {
  x: number;
  y: number;
}

interface MarqueeRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/**
 * Pending geometry for the element being resized/rotated. It renders live on
 * top of the spec during the drag and is committed as a single history entry
 * when the pointer is released.
 */
interface GeometryPreview {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg: number;
}

interface MoveDeltaState {
  dxMm: number;
  dyMm: number;
  ids: ReadonlySet<string>;
}

interface MoveDrag {
  kind: "move";
  startPx: Point;
  origins: Map<string, { xMm: number; yMm: number }>;
  ids: ReadonlySet<string>;
  dxMm: number;
  dyMm: number;
  moved: boolean;
}

interface ResizeDrag {
  kind: "resize";
  handle: HandleId;
  startPx: Point;
  /** Snapshot taken at drag start; cumulative pointer deltas are applied to it. */
  element: DocumentElement;
  box: RotatedBox;
  moved: boolean;
}

interface RotateDrag {
  kind: "rotate";
  /** Snapshot taken at drag start; the box never changes while rotating. */
  element: DocumentElement;
  pointerAngle0: number;
  rotation0: number;
  rotationDeg: number;
  moved: boolean;
}

type Drag =
  | { kind: "idle" }
  | MoveDrag
  | ResizeDrag
  | RotateDrag
  | { kind: "marquee"; originMm: Point; current: MarqueeRect }
  | { kind: "pan"; startScroll: Point; startPx: Point };

function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  );
}

function computeMoveDelta(
  drag: MoveDrag,
  pointer: Point,
  mmPerPx: number,
  context: {
    gridEnabled: boolean;
    snapEnabled: boolean;
    page: DocumentPage;
    elements: DocumentElement[];
    selection: string[];
  },
): { dxMm: number; dyMm: number; guides: SnapGuide[] } {
  let dxMm = (pointer.x - drag.startPx.x) * mmPerPx;
  let dyMm = (pointer.y - drag.startPx.y) * mmPerPx;
  const guides: SnapGuide[] = [];

  const leadEntry = [...drag.origins][0];
  if (!leadEntry) return { dxMm, dyMm, guides };
  const [leadId, leadOrigin] = leadEntry;

  if (context.gridEnabled && context.snapEnabled) {
    dxMm = snapToGrid(leadOrigin.xMm + dxMm, GRID_MM) - leadOrigin.xMm;
    dyMm = snapToGrid(leadOrigin.yMm + dyMm, GRID_MM) - leadOrigin.yMm;
  } else if (context.snapEnabled && drag.origins.size === 1) {
    const leadElement = context.elements.find((element) => element.id === leadId);
    if (leadElement) {
      const targets = collectSnapTargets(context.page, context.elements, new Set(context.selection));
      const snapped = snapBox(
        {
          xMm: leadOrigin.xMm + dxMm,
          yMm: leadOrigin.yMm + dyMm,
          widthMm: leadElement.widthMm,
          heightMm: leadElement.heightMm,
        },
        targets,
        SNAP_THRESHOLD_PX * mmPerPx,
      );
      dxMm = snapped.xMm - leadOrigin.xMm;
      dyMm = snapped.yMm - leadOrigin.yMm;
      guides.push(...snapped.guides);
    }
  }
  return { dxMm, dyMm, guides };
}

function idsIntersectingRect(elements: DocumentElement[], rect: MarqueeRect): string[] {
  const minX = Math.min(rect.xMm, rect.xMm + rect.widthMm);
  const maxX = Math.max(rect.xMm, rect.xMm + rect.widthMm);
  const minY = Math.min(rect.yMm, rect.yMm + rect.heightMm);
  const maxY = Math.max(rect.yMm, rect.yMm + rect.heightMm);
  return elements
    .filter((element) =>
      elementCorners(element).some(
        (corner) => corner.x >= minX && corner.x <= maxX && corner.y >= minY && corner.y <= maxY,
      ),
    )
    .map((element) => element.id);
}

export interface CanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Display scale, clamped to 0.25–4. */
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  tokens: TokenMap;
  imageUrls: Record<string, string>;
  /** Increments each time a fit-to-screen is requested; 0 = initial (skip). */
  fitRequest: number;
  onZoomChange: (zoom: number) => void;
}

export function Canvas({
  state,
  dispatch,
  zoom,
  gridEnabled,
  snapEnabled,
  tokens,
  imageUrls,
  fitRequest,
  onZoomChange,
}: CanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef(false);
  const dragRef = useRef<Drag>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [moveDelta, setMoveDelta] = useState<MoveDeltaState | null>(null);
  const [preview, setPreview] = useState<GeometryPreview | null>(null);
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  const { widthMm, heightMm } = useMemo(() => resolvePageSize(state.spec.page), [state.spec.page]);

  const previewedElements = useMemo(
    () =>
      state.spec.elements.map((element): DocumentElement =>
        preview && preview.id === element.id ? { ...element, ...preview } : element,
      ),
    [preview, state.spec.elements],
  );

  const selected = useMemo(
    () => previewedElements.filter((element) => state.selection.includes(element.id)),
    [previewedElements, state.selection],
  );

  // The overlay has no dx/dy props, so live move offsets are merged here.
  const overlaySelected = useMemo(
    () =>
      selected.map((element): DocumentElement =>
        moveDelta && moveDelta.ids.has(element.id)
          ? { ...element, xMm: element.xMm + moveDelta.dxMm, yMm: element.yMm + moveDelta.dyMm }
          : element,
      ),
    [moveDelta, selected],
  );

  const pagePointMm = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left) / (PX_PER_MM * zoom),
        y: (event.clientY - rect.top) / (PX_PER_MM * zoom),
      };
    },
    [zoom],
  );

  // Commits the drag currently on the ref as a single UPDATE_ELEMENTS dispatch,
  // so each drag (move/resize/rotate) is exactly one undo step.
  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag.kind === "move" && drag.moved) {
      dispatch({
        type: "UPDATE_ELEMENTS",
        updates: [...drag.origins.entries()].map(([id, origin]) => ({
          id,
          patch: { xMm: origin.xMm + drag.dxMm, yMm: origin.yMm + drag.dyMm },
        })),
      });
    } else if (drag.kind === "resize" && drag.moved) {
      dispatch({
        type: "UPDATE_ELEMENTS",
        updates: [
          {
            id: drag.element.id,
            patch: {
              xMm: drag.box.xMm,
              yMm: drag.box.yMm,
              widthMm: drag.box.widthMm,
              heightMm: drag.box.heightMm,
            },
          },
        ],
      });
    } else if (drag.kind === "rotate" && drag.moved) {
      dispatch({
        type: "UPDATE_ELEMENTS",
        updates: [{ id: drag.element.id, patch: { rotationDeg: drag.rotationDeg } }],
      });
    }
  }, [dispatch]);

  const onElementPointerDown = useCallback(
    (event: ReactPointerEvent, element: DocumentElement) => {
      if (event.button !== 0 || spaceRef.current) return;
      event.stopPropagation();
      const additive = event.shiftKey;
      let selection = state.selection;
      if (additive) {
        selection = selection.includes(element.id)
          ? selection.filter((id) => id !== element.id)
          : [...selection, element.id];
        dispatch({ type: "SET_SELECTION", ids: selection });
        if (!selection.includes(element.id)) return;
      } else if (!selection.includes(element.id)) {
        selection = [element.id];
        dispatch({ type: "SET_SELECTION", ids: selection });
      }

      if (element.locked) return;
      const movable = state.spec.elements.filter((e) => selection.includes(e.id) && !e.locked);
      if (movable.length === 0) return;

      const origins = new Map(movable.map((e) => [e.id, { xMm: e.xMm, yMm: e.yMm }]));
      dragRef.current = {
        kind: "move",
        startPx: { x: event.clientX, y: event.clientY },
        origins,
        ids: new Set(origins.keys()),
        dxMm: 0,
        dyMm: 0,
        moved: false,
      };
      setDragging(true);
      // Capture on the page (not the handle/element, which unmounts while
      // dragging) so pointerup outside the page still commits the drag.
      pageRef.current?.setPointerCapture(event.pointerId);
      viewportRef.current?.focus();
    },
    [dispatch, state.selection, state.spec.elements],
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent, handle: HandleId) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const element = selected.find((e) => !e.locked);
      if (!element) return;
      dragRef.current = {
        kind: "resize",
        handle,
        startPx: { x: event.clientX, y: event.clientY },
        element,
        box: {
          xMm: element.xMm,
          yMm: element.yMm,
          widthMm: element.widthMm,
          heightMm: element.heightMm,
          rotationDeg: element.rotationDeg,
        },
        moved: false,
      };
      setDragging(true);
      // The handle unmounts once dragging starts, so capture on the page.
      pageRef.current?.setPointerCapture(event.pointerId);
    },
    [selected],
  );

  const onRotatePointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const element = selected.find((e) => !e.locked);
      if (!element) return;
      const pointMm = pagePointMm(event);
      const centerMm = {
        x: element.xMm + element.widthMm / 2,
        y: element.yMm + element.heightMm / 2,
      };
      const pointerAngle0 =
        (Math.atan2(pointMm.y - centerMm.y, pointMm.x - centerMm.x) * 180) / Math.PI;
      dragRef.current = {
        kind: "rotate",
        element,
        pointerAngle0,
        rotation0: element.rotationDeg,
        rotationDeg: element.rotationDeg,
        moved: false,
      };
      setDragging(true);
      // The rotate handle unmounts once dragging starts, so capture on the page.
      pageRef.current?.setPointerCapture(event.pointerId);
    },
    [pagePointMm, selected],
  );

  const onPagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== MIDDLE_MOUSE_BUTTON) return;
      const viewport = viewportRef.current;
      if (spaceRef.current || event.button === MIDDLE_MOUSE_BUTTON) {
        if (!viewport) return;
        // Middle button otherwise triggers browser autoscroll and selection.
        if (event.button === MIDDLE_MOUSE_BUTTON) event.preventDefault();
        dragRef.current = {
          kind: "pan",
          startScroll: { x: viewport.scrollLeft, y: viewport.scrollTop },
          startPx: { x: event.clientX, y: event.clientY },
        };
      } else {
        const originMm = pagePointMm(event);
        dragRef.current = {
          kind: "marquee",
          originMm,
          current: { xMm: originMm.x, yMm: originMm.y, widthMm: 0, heightMm: 0 },
        };
        setMarquee(dragRef.current.current);
        setDragging(true);
        viewport?.focus();
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pagePointMm],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (drag.kind === "idle") return;
      const mmPerPx = 1 / (PX_PER_MM * zoom);

      switch (drag.kind) {
        case "pan": {
          const viewport = viewportRef.current;
          if (!viewport) return;
          viewport.scrollLeft = drag.startScroll.x - (event.clientX - drag.startPx.x);
          viewport.scrollTop = drag.startScroll.y - (event.clientY - drag.startPx.y);
          return;
        }
        case "marquee": {
          const point = pagePointMm(event);
          drag.current = {
            xMm: drag.originMm.x,
            yMm: drag.originMm.y,
            widthMm: point.x - drag.originMm.x,
            heightMm: point.y - drag.originMm.y,
          };
          setMarquee(drag.current);
          return;
        }
        case "move": {
          drag.moved = true;
          const result = computeMoveDelta(
            drag,
            { x: event.clientX, y: event.clientY },
            mmPerPx,
            {
              gridEnabled,
              snapEnabled,
              page: state.spec.page,
              elements: state.spec.elements,
              selection: state.selection,
            },
          );
          drag.dxMm = result.dxMm;
          drag.dyMm = result.dyMm;
          setMoveDelta({ dxMm: result.dxMm, dyMm: result.dyMm, ids: drag.ids });
          setGuides(result.guides);
          return;
        }
        case "resize": {
          const next = resizeBox(
            drag.element,
            drag.handle,
            (event.clientX - drag.startPx.x) * mmPerPx,
            (event.clientY - drag.startPx.y) * mmPerPx,
            { aspectRatio: event.shiftKey },
          );
          drag.box = next;
          drag.moved = true;
          setPreview({ id: drag.element.id, ...next });
          return;
        }
        case "rotate": {
          const point = pagePointMm(event);
          const centerMm = {
            x: drag.element.xMm + drag.element.widthMm / 2,
            y: drag.element.yMm + drag.element.heightMm / 2,
          };
          const pointerAngle =
            (Math.atan2(point.y - centerMm.y, point.x - centerMm.x) * 180) / Math.PI;
          const raw = drag.rotation0 + (pointerAngle - drag.pointerAngle0);
          const rotationDeg = event.shiftKey
            ? normalizeAngle(Math.round(raw / ROTATE_STEP_DEG) * ROTATE_STEP_DEG)
            : snapAngle(raw, ROTATE_MAGNET_THRESHOLD_DEG);
          drag.rotationDeg = rotationDeg;
          drag.moved = true;
          setPreview({
            id: drag.element.id,
            xMm: drag.element.xMm,
            yMm: drag.element.yMm,
            widthMm: drag.element.widthMm,
            heightMm: drag.element.heightMm,
            rotationDeg,
          });
          return;
        }
      }
    },
    [gridEnabled, pagePointMm, snapEnabled, state.spec.elements, state.spec.page, state.selection, zoom],
  );

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current;
    commitDrag();
    if (drag.kind === "marquee") {
      dispatch({ type: "SET_SELECTION", ids: idsIntersectingRect(state.spec.elements, drag.current) });
      setMarquee(null);
    }
    dragRef.current = { kind: "idle" };
    setMoveDelta(null);
    setPreview(null);
    setDragging(false);
    setGuides([]);
  }, [commitDrag, dispatch, state.spec.elements]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
      } else if (meta && key === "y") {
        event.preventDefault();
        dispatch({ type: "REDO" });
      } else if (meta && key === "a") {
        event.preventDefault();
        dispatch({ type: "SET_SELECTION", ids: state.spec.elements.map((element) => element.id) });
      } else if (meta && key === "c") {
        dispatch({ type: "COPY_SELECTED" });
      } else if (meta && key === "v") {
        dispatch({ type: "PASTE" });
      } else if (meta && key === "d") {
        event.preventDefault();
        dispatch({ type: "DUPLICATE_SELECTED" });
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        dispatch({ type: "DELETE_SELECTED" });
      } else if (key === "escape") {
        dispatch({ type: "SET_SELECTION", ids: [] });
      } else if (key.startsWith("arrow")) {
        event.preventDefault();
        const distanceMm = event.shiftKey ? BIG_NUDGE_MM : NUDGE_MM;
        const direction = key.endsWith("left") || key.endsWith("up") ? -1 : 1;
        const horizontal = key.endsWith("left") || key.endsWith("right");
        dispatch({
          type: "UPDATE_ELEMENTS",
          updates: selected
            .filter((element) => !element.locked)
            .map((element) => ({
              id: element.id,
              patch: horizontal
                ? { xMm: element.xMm + direction * distanceMm }
                : { yMm: element.yMm + direction * distanceMm },
            })),
        });
      }
    },
    [dispatch, selected, state.spec.elements],
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== " " || isEditableTarget(event.target)) return;
      spaceRef.current = true;
      setSpaceHeld(true);
      // Space would otherwise scroll the focused viewport.
      if (event.target === viewportRef.current) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // React registers onWheel passively, so preventDefault for Ctrl+wheel zoom
  // needs a native non-passive listener.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_STEP_IN : ZOOM_STEP_OUT;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
      onZoomChange(Math.round(next * 100) / 100);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onZoomChange, zoom]);

  // Each fit request (counter bump from the toolbar) measures the viewport and
  // scales the page to fit inside it, minus padding; 0 is the mount value.
  useEffect(() => {
    if (fitRequest === 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fitZoom = Math.min(
      (viewport.clientWidth - FIT_PADDING_PX) / mmToPx(widthMm),
      (viewport.clientHeight - FIT_PADDING_PX) / mmToPx(heightMm),
    );
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fitZoom));
    onZoomChange(Math.round(next * 100) / 100);
  }, [fitRequest, heightMm, onZoomChange, widthMm]);

  const pageWidthPx = mmToPx(widthMm);
  const pageHeightPx = mmToPx(heightMm);
  const { margins } = state.spec.page;

  const pageStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: pageWidthPx,
    height: pageHeightPx,
    background: state.spec.page.background,
    boxShadow: "0 4px 24px rgba(15, 23, 42, 0.18)",
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    touchAction: "none",
  };

  const gridStyle: CSSProperties | undefined = gridEnabled
    ? {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage:
          "linear-gradient(to right, rgba(100,116,139,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.18) 1px, transparent 1px)",
        backgroundSize: `${mmToPx(GRID_MM)}px ${mmToPx(GRID_MM)}px`,
      }
    : undefined;

  const marginStyle: CSSProperties = {
    position: "absolute",
    left: mmToPx(margins.left),
    top: mmToPx(margins.top),
    width: mmToPx(widthMm - margins.left - margins.right),
    height: mmToPx(heightMm - margins.top - margins.bottom),
    border: "1px dashed rgba(100,116,139,0.45)",
    pointerEvents: "none",
  };

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="application"
      aria-label="Certificate canvas"
      onKeyDown={onKeyDown}
      className="h-full flex-1 overflow-auto bg-muted/40 outline-none"
      style={{ cursor: spaceHeld ? "grab" : undefined }}
    >
      <div className="min-h-full min-w-full p-10">
        {/* Reserves the scaled page extent so scrollbars track the zoom. */}
        <div className="relative" style={{ width: pageWidthPx * zoom, height: pageHeightPx * zoom }}>
          <div
            ref={pageRef}
            data-canvas-page
            style={pageStyle}
            onPointerDown={onPagePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {gridStyle ? <div style={gridStyle} /> : null}
            <div style={marginStyle} />
            {previewedElements.map((element) => (
              <ElementView
                key={element.id}
                element={element}
                tokens={tokens}
                imageUrls={imageUrls}
                dxMm={moveDelta?.ids.has(element.id) ? moveDelta.dxMm : 0}
                dyMm={moveDelta?.ids.has(element.id) ? moveDelta.dyMm : 0}
                interactive={!dragging}
                onPointerDown={onElementPointerDown}
              />
            ))}
            <SelectionOverlay
              selected={overlaySelected}
              zoom={zoom}
              interactive={!dragging}
              guides={guides}
              marquee={marquee}
              onHandlePointerDown={onHandlePointerDown}
              onRotatePointerDown={onRotatePointerDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
