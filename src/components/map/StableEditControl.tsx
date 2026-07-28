/**
 * react-leaflet-draw's EditControl never updates its internal propsRef after the first
 * draw/edit change, so every later parent re-render tears down Control.Draw and kills
 * an in-progress polygon/polyline. This wrapper keeps propsRef in sync.
 */
import { PropTypes } from 'prop-types';
import 'leaflet-draw'; // side-effect: registers L.Control.Draw
import isEqual from 'fast-deep-equal';
import React, { useRef } from 'react';
import { useLeafletContext } from '@react-leaflet/core';
import leaflet, { Map } from 'leaflet';

const eventHandlers = {
  onEdited: 'draw:edited',
  onDrawStart: 'draw:drawstart',
  onDrawStop: 'draw:drawstop',
  onDrawVertex: 'draw:drawvertex',
  onEditStart: 'draw:editstart',
  onEditMove: 'draw:editmove',
  onEditResize: 'draw:editresize',
  onEditVertex: 'draw:editvertex',
  onEditStop: 'draw:editstop',
  onDeleted: 'draw:deleted',
  onDeleteStart: 'draw:deletestart',
  onDeleteStop: 'draw:deletestop',
} as const;

type DrawEventKey = keyof typeof eventHandlers;

type Props = {
  position?: 'topright' | 'topleft' | 'bottomright' | 'bottomleft';
  draw?: Record<string, unknown>;
  edit?: Record<string, unknown>;
  onCreated?: (e: any) => void;
  onEdited?: (e: any) => void;
  onDeleted?: (e: any) => void;
  onMounted?: (control: any) => void;
  onDrawStart?: (e: any) => void;
  onDrawStop?: (e: any) => void;
  onDrawVertex?: (e: any) => void;
  onEditStart?: (e: any) => void;
  onEditMove?: (e: any) => void;
  onEditResize?: (e: any) => void;
  onEditVertex?: (e: any) => void;
  onEditStop?: (e: any) => void;
  onDeleteStart?: (e: any) => void;
  onDeleteStop?: (e: any) => void;
};

function createDrawElement(props: Props, context: ReturnType<typeof useLeafletContext>) {
  const { layerContainer } = context;
  const { draw, edit, position } = props;
  const options: Record<string, unknown> = {
    edit: {
      ...edit,
      featureGroup: layerContainer,
    },
  };

  if (draw) {
    options.draw = { ...draw };
  }

  if (position) {
    options.position = position;
  }

  return new (leaflet as any).Control.Draw(options);
}

export function StableEditControl(props: Props) {
  const context = useLeafletContext();
  const drawRef = useRef<any>();
  const propsRef = useRef(props);

  const onDrawCreate = (e: any) => {
    const { onCreated } = propsRef.current;
    const container = context.layerContainer || context.map;
    container.addLayer(e.layer);
    onCreated?.(e);
  };

  React.useEffect(() => {
    const { map } = context;
    const { onMounted } = propsRef.current;

    // Bind named listeners so cleanup does not map.off(type) with no fn —
    // that would wipe DrawingActionBar and other draw:* subscribers.
    const bound: Array<[string, (evt: any) => void]> = [];
    for (const key of Object.keys(eventHandlers) as DrawEventKey[]) {
      const type = eventHandlers[key];
      const listener = (evt: any) => {
        const handler = (Object.keys(eventHandlers) as DrawEventKey[]).find(
          (h) => eventHandlers[h] === evt.type
        );
        if (!handler) return;
        const fn = propsRef.current[handler];
        fn?.(evt);
      };
      map.on(type, listener);
      bound.push([type, listener]);
    }
    map.on(leaflet.Draw.Event.CREATED, onDrawCreate);
    drawRef.current = createDrawElement(propsRef.current, context);
    map.addControl(drawRef.current);
    onMounted?.(drawRef.current);

    return () => {
      map.off(leaflet.Draw.Event.CREATED, onDrawCreate);
      for (const [type, listener] of bound) {
        map.off(type, listener);
      }
      try {
        drawRef.current?.remove(map);
      } catch {
        /* already removed */
      }
    };
    // Mount once — handlers always read propsRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (
      isEqual(props.draw, propsRef.current.draw) &&
      isEqual(props.edit, propsRef.current.edit) &&
      props.position === propsRef.current.position
    ) {
      propsRef.current = props;
      return;
    }

    const { map } = context;
    try {
      drawRef.current?.remove(map);
    } catch {
      /* ignore */
    }
    drawRef.current = createDrawElement(props, context);
    drawRef.current.addTo(map);
    props.onMounted?.(drawRef.current);
    propsRef.current = props;
  }, [props, context]);

  return null;
}

StableEditControl.propTypes = {
  ...Object.keys(eventHandlers).reduce(
    (acc, val) => {
      acc[val] = PropTypes.func;
      return acc;
    },
    {} as Record<string, typeof PropTypes.func>
  ),
  onCreated: PropTypes.func,
  onMounted: PropTypes.func,
  draw: PropTypes.object,
  edit: PropTypes.object,
  position: PropTypes.oneOf([
    'topright',
    'topleft',
    'bottomright',
    'bottomleft',
  ]),
  leaflet: PropTypes.shape({
    map: PropTypes.instanceOf(Map),
    layerContainer: PropTypes.shape({
      addLayer: PropTypes.func.isRequired,
      removeLayer: PropTypes.func.isRequired,
    }),
  }),
};
