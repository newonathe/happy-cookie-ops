'use client';
import type { LiveDoughPreparation } from '@/lib/production/live-production-types';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/banner';
import Image from 'next/image';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { useEffect, useRef } from 'react';
import { ProductionRecipeUpdate } from './production-recipe-update';
import { ProductionDeviceNotice } from './production-recovery-notice';

export function ProductionDough({ data }: { data: LiveDoughPreparation }) {
  const locked =
    data.saving || data.uncertain || data.sourceChanged || data.sourceUnavailable || data.readOnly;
  const photo = resolveImagePath(data.photo);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [data.id, data.reviewing]);
  return (
    <section aria-label="Dough preparation" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-3">
        {photo ? (
          <Image
            src={photo}
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : null}
        <div>
          <p className="m-0 text-caption text-ink-mute">
            {data.periodText} · {data.reviewing ? '2. Review' : '1. Amount'} ·{' '}
            {data.version === null ? 'Recipe unavailable' : `Recipe v${data.version}`}
          </p>
          <h2 ref={heading} tabIndex={-1} className="m-0 text-title text-ink">
            {data.name}
          </h2>
        </div>
      </div>
      <ProductionDeviceNotice
        readOnly={data.readOnly}
        copyReady={data.copyReady}
        connected={data.connected}
        retry={data.retryCopy}
      />
      {data.uncertain ? (
        <Banner
          tone="warn"
          title="Save result not confirmed"
          body="Check the original mix before changing or discarding it."
        />
      ) : data.sourceUnavailable ? (
        <Banner
          tone="warn"
          title="Saved recipe unavailable"
          body="Your mix is kept. Read the saved recipe before continuing."
          action={
            data.retryRecipe
              ? { label: 'Retry saved recipe', onPress: data.retryRecipe }
              : undefined
          }
        />
      ) : data.sourceChanged ? (
        <Banner
          tone="warn"
          title={
            data.recipeUpdate?.previousVersion === null ? 'Review saved recipe' : 'Recipe changed'
          }
          body="Your quantities are kept. Review the recipe before recording this mix."
        />
      ) : null}
      {data.recipeUpdate && !data.uncertain && !data.readOnly ? (
        <ProductionRecipeUpdate update={data.recipeUpdate} dough />
      ) : null}
      {data.validAmount === false &&
      !data.uncertain &&
      !data.sourceChanged &&
      !data.sourceUnavailable ? (
        <Banner
          tone="warn"
          title="Choose a recipe amount"
          body="Your previous amount is kept below. Choose full or half of this recipe before continuing."
        />
      ) : null}
      {!data.reviewing && !data.sourceUnavailable ? (
        <div role="group" aria-label="Recipe amount" className="flex flex-wrap gap-2">
          {data.portions.map((portion) => (
            <Button
              key={portion.label}
              aria-pressed={portion.selected}
              variant={portion.selected ? 'primary' : 'secondary'}
              disabled={locked}
              onClick={portion.choose}
            >
              {portion.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex items-baseline gap-2">
        <strong className="text-3xl font-semibold tabular-nums">{data.balls}</strong>
        <span className="text-body text-ink-soft">
          {data.uncertain
            ? 'portions in this submission'
            : data.sourceUnavailable
              ? 'draft portions · not recorded'
              : 'portions to mix'}
        </span>
      </div>
      {!data.uncertain && !data.sourceChanged && !data.sourceUnavailable ? (
        <section aria-label="Dough ingredients" className="flex flex-col gap-3">
          <h3 className="m-0 text-body font-semibold">
            {data.reviewing ? 'Review ingredient use' : 'Ingredients'}
          </h3>
          {data.rows.map((row, i) => (
            <div
              key={i}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-2"
            >
              <span>
                <strong className="block text-body">{row.name}</strong>
                <small className="text-caption text-ink-mute">{row.balanceText}</small>
              </span>
              <span className="text-body font-semibold">
                {row.amountText}
                {row.short ? <small className="block text-warn">Stock short</small> : null}
              </span>
            </div>
          ))}
        </section>
      ) : null}
      <p className="m-0 text-caption text-ink-mute">
        {data.uncertain
          ? 'The saved result is not confirmed yet.'
          : 'Dough and ingredient balances update after the saved result is confirmed.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {data.reviewing ? (
          <>
            <Button disabled={locked} onClick={data.back}>
              Back to amount
            </Button>
            <Button
              variant="primary"
              disabled={
                data.saving ||
                data.readOnly ||
                data.connected === false ||
                (data.copyReady === false && !data.uncertain) ||
                (!data.uncertain &&
                  (data.sourceUnavailable || data.sourceChanged || data.validAmount === false))
              }
              onClick={data.confirm}
            >
              {data.saving
                ? 'Saving dough…'
                : data.uncertain
                  ? 'Check saved result'
                  : 'Confirm dough'}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            disabled={locked || data.validAmount === false}
            onClick={data.review}
          >
            Review dough
          </Button>
        )}
        <Button
          variant="danger"
          disabled={data.saving || data.uncertain || data.readOnly}
          onClick={data.discard}
        >
          Discard mix
        </Button>
        <Button variant="ghost" onClick={data.close}>
          Leave for now
        </Button>
      </div>
      {data.saving ? (
        <p role="status" className="text-caption text-ink-mute">
          Waiting for the saved result. You can close this form and prepare other work.
        </p>
      ) : null}
    </section>
  );
}
