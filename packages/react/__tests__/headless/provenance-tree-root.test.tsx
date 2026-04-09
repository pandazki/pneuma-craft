import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { ProvenanceTreeRoot, type ProvenanceTreeState } from '../../src/headless/provenance-tree-root.js';
import { createTestWrapper } from '../helpers.js';
import { usePneumaCraftStore } from '../../src/context.js';

describe('ProvenanceTreeRoot', () => {
  it('expandedIds reset when assetId prop changes', () => {
    const Wrapper = createTestWrapper();

    let dispatchFn!: (actor: any, command: any) => any;

    function DispatchCapture() {
      dispatchFn = usePneumaCraftStore((s) => s.dispatch);
      return null;
    }

    const capturedStates: ProvenanceTreeState[] = [];

    function TreeCapture({ assetId }: { assetId: string }) {
      return (
        <ProvenanceTreeRoot assetId={assetId}>
          {(state) => {
            capturedStates.push(state);
            return <div data-testid="tree">{assetId}</div>;
          }}
        </ProvenanceTreeRoot>
      );
    }

    // Initial render to get dispatch
    const { rerender } = render(
      <Wrapper>
        <DispatchCapture />
      </Wrapper>,
    );

    let asset1Id: string;
    let asset2Id: string;

    act(() => {
      // Register two assets
      const events1 = dispatchFn('human', {
        type: 'asset:register',
        asset: {
          type: 'video',
          uri: '/a.mp4',
          name: 'Asset A',
          metadata: {},
        },
      });
      asset1Id = (events1[0] as any).payload.asset.id;

      const events2 = dispatchFn('human', {
        type: 'asset:register',
        asset: {
          type: 'video',
          uri: '/b.mp4',
          name: 'Asset B',
          metadata: {},
        },
      });
      asset2Id = (events2[0] as any).payload.asset.id;

      // Create provenance roots so getTree returns non-null
      dispatchFn('human', {
        type: 'provenance:set-root',
        assetId: asset1Id,
        operation: 'import',
      });
      dispatchFn('human', {
        type: 'provenance:set-root',
        assetId: asset2Id,
        operation: 'import',
      });
    });

    // Render tree with asset1
    capturedStates.length = 0;
    rerender(
      <Wrapper>
        <DispatchCapture />
        <TreeCapture assetId={asset1Id!} />
      </Wrapper>,
    );

    const stateForAsset1 = capturedStates[capturedStates.length - 1];
    expect(stateForAsset1.tree).not.toBeNull();
    expect(stateForAsset1.tree!.assetId).toBe(asset1Id!);
    // The root node should be expanded by default (expandedIds starts with [assetId])
    expect(stateForAsset1.tree!.expanded).toBe(true);

    // Rerender with asset2 — expandedIds should reset
    capturedStates.length = 0;
    rerender(
      <Wrapper>
        <DispatchCapture />
        <TreeCapture assetId={asset2Id!} />
      </Wrapper>,
    );

    const stateForAsset2 = capturedStates[capturedStates.length - 1];
    expect(stateForAsset2.tree).not.toBeNull();
    expect(stateForAsset2.tree!.assetId).toBe(asset2Id!);
    // The new root should be expanded (expandedIds reset to [asset2Id])
    expect(stateForAsset2.tree!.expanded).toBe(true);
  });
});
