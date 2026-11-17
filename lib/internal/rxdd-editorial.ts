import { prisma } from '@/lib/db/client';
import { buildInitialCampaignLinks, syncCampaignLinks } from '@/lib/campaigns/links';
import { generateReportShareSlug } from '@/lib/reports/share';
import {
  CLICK_ROW_SELECT,
  calculateCtr,
  countUniqueClicksBy
} from '@/lib/tracking/analytics';
import { z } from 'zod';

export const RXDD_PUBLICATION_GOAL_PREFIX = 'rxdd_publicacao_id:';

export const rxddPrepareAutomationSchema = z.object({
  workspace_id: z.string().min(1),
  instagram_account_id: z.string().min(1),
  rxdd_publicacao_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1).max(50)).max(10).default([]),
  match_any_word: z.boolean().default(false),
  whole_word_match: z.boolean().default(true),
  dm_message: z.string().min(1).max(1000),
  public_reply_enabled: z.boolean().default(false),
  public_reply_message: z.string().max(1000).optional().nullable(),
  tracked_destination_url: z.union([z.string().url(), z.literal('')]).optional().nullable(),
  link_button_label: z.string().max(20).optional().nullable(),
  is_active: z.boolean().default(false)
});

export const rxddUpdateAutomationSchema = z.object({
  workspace_id: z.string().min(1),
  rxdd_publicacao_id: z.string().uuid(),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
  match_any_word: z.boolean().optional(),
  whole_word_match: z.boolean().optional(),
  dm_message: z.string().min(1).max(1000).optional(),
  public_reply_enabled: z.boolean().optional(),
  public_reply_message: z.string().max(1000).optional().nullable(),
  tracked_destination_url: z.union([z.string().url(), z.literal('')]).optional().nullable(),
  is_active: z.boolean().optional()
});

export const rxddBindReelSchema = z.object({
  workspace_id: z.string().min(1),
  rxdd_publicacao_id: z.string().uuid(),
  instagram_media_id: z.string().min(1),
  post_url: z.string().url().optional().nullable(),
  zernio_account_id: z.string().optional().nullable(),
  activate: z.boolean().default(true)
});

function pendingPostId(rxddPublicacaoId: string) {
  return `rxdd-pending-${rxddPublicacaoId}`;
}

export async function assertRxddAutomationOwnership(
  automationId: string,
  workspaceId: string,
  publicacaoId: string
) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, workspaceId },
    include: { instagramAccount: true, trackedLinks: { orderBy: { position: 'asc' } } }
  });
  if (!automation) return null;
  if (!automation.goal?.includes(`${RXDD_PUBLICATION_GOAL_PREFIX}${publicacaoId}`)) {
    return null;
  }
  return automation;
}

export async function rxddPrepareAutomation(input: z.infer<typeof rxddPrepareAutomationSchema>) {
  const account = await prisma.instagramAccount.findFirst({
    where: { id: input.instagram_account_id, workspaceId: input.workspace_id }
  });
  if (!account) {
    throw new Error('Instagram account not in workspace');
  }

  const keywords = input.match_any_word ? [] : input.keywords;
  if (!input.match_any_word && keywords.length === 0) {
    throw new Error('At least one keyword required');
  }

  const publicReplies =
    input.public_reply_enabled && input.public_reply_message?.trim()
      ? [input.public_reply_message.trim()]
      : [];

  const linkCreates = buildInitialCampaignLinks({
    workspaceId: input.workspace_id,
    primaryUrl: input.tracked_destination_url
  });

  return prisma.automation.create({
    data: {
      workspaceId: input.workspace_id,
      instagramAccountId: account.id,
      name: input.name,
      goal: `${RXDD_PUBLICATION_GOAL_PREFIX}${input.rxdd_publicacao_id}`,
      postId: pendingPostId(input.rxdd_publicacao_id),
      pendingNextReel: false,
      matchAnyPost: false,
      keywords,
      matchAnyWord: input.match_any_word,
      dmMessage: input.dm_message,
      publicReplyEnabled: input.public_reply_enabled,
      publicReplyMessages: publicReplies,
      publicReplyMessage: publicReplies[0] ?? null,
      linkButtonLabel: input.link_button_label ?? null,
      wholeWordMatch: input.whole_word_match,
      isActive: input.is_active,
      reportShareSlug: generateReportShareSlug(),
      ...(linkCreates.length > 0 ? { trackedLinks: { create: linkCreates } } : {})
    },
    include: { trackedLinks: true, instagramAccount: { select: { id: true, username: true } } }
  });
}

export async function rxddUpdateAutomation(
  automationId: string,
  input: z.infer<typeof rxddUpdateAutomationSchema>
) {
  const existing = await assertRxddAutomationOwnership(
    automationId,
    input.workspace_id,
    input.rxdd_publicacao_id
  );
  if (!existing) throw new Error('Campaign not found for this publication');

  const data: Record<string, unknown> = {};
  if (input.match_any_word === true) {
    data.keywords = [];
    data.matchAnyWord = true;
  } else if (input.keywords !== undefined) {
    data.keywords = input.keywords;
    data.matchAnyWord = false;
  } else if (input.match_any_word === false) {
    data.matchAnyWord = false;
  }
  if (input.whole_word_match !== undefined) data.wholeWordMatch = input.whole_word_match;
  if (input.dm_message) data.dmMessage = input.dm_message;
  if (input.public_reply_enabled !== undefined) {
    data.publicReplyEnabled = input.public_reply_enabled;
    if (!input.public_reply_enabled) {
      data.publicReplyMessages = [];
      data.publicReplyMessage = null;
    }
  }
  if (input.public_reply_message !== undefined) {
    const msg = input.public_reply_message?.trim() ?? '';
    const list = msg ? [msg] : [];
    data.publicReplyMessages = list;
    data.publicReplyMessage = list[0] ?? null;
  }
  if (input.is_active !== undefined) data.isActive = input.is_active;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.automation.update({
      where: { id: automationId },
      data
    });

    if (input.tracked_destination_url !== undefined) {
      await syncCampaignLinks(tx, {
        workspaceId: input.workspace_id,
        automationId,
        primaryUrl: input.tracked_destination_url,
        secondaryUrl: null,
        secondaryLabel: null
      });
    }

    return tx.automation.findFirst({
      where: { id: automationId },
      include: { trackedLinks: { orderBy: { position: 'asc' } } }
    });
  });
}

export async function rxddBindInstagramReel(
  automationId: string,
  input: z.infer<typeof rxddBindReelSchema>
) {
  const existing = await assertRxddAutomationOwnership(
    automationId,
    input.workspace_id,
    input.rxdd_publicacao_id
  );
  if (!existing) throw new Error('Campaign not found for this publication');

  if (input.zernio_account_id && existing.instagramAccount.zernioAccountId) {
    if (input.zernio_account_id !== existing.instagramAccount.zernioAccountId) {
      throw new Error('Instagram account does not match Zernio connection');
    }
  }

  if (existing.postId && existing.postId !== pendingPostId(input.rxdd_publicacao_id)) {
    if (existing.postId !== input.instagram_media_id) {
      throw new Error('Campaign already bound to another reel');
    }
  }

  return prisma.automation.update({
    where: { id: automationId },
    data: {
      postId: input.instagram_media_id,
      postUrl: input.post_url ?? null,
      pendingNextReel: false,
      matchAnyPost: false,
      isActive: input.activate
    },
    include: { trackedLinks: { orderBy: { position: 'asc' } } }
  });
}

export async function rxddAutomationStatus(automationId: string, workspaceId: string, publicacaoId: string) {
  const automation = await assertRxddAutomationOwnership(automationId, workspaceId, publicacaoId);
  if (!automation) throw new Error('Campaign not found');

  const [sent, failed, clicks] = await Promise.all([
    prisma.dmLog.count({ where: { automationId, status: 'SENT' } }),
    prisma.dmLog.count({ where: { automationId, status: 'FAILED' } }),
    prisma.linkClick.findMany({
      where: { automationId },
      select: CLICK_ROW_SELECT
    })
  ]);

  const clickMap = countUniqueClicksBy(clicks, (r) => r.automationId);
  const uniqueClicks = clickMap.get(automationId) ?? 0;

  return {
    automation,
    sync: {
      post_id: automation.postId,
      post_url: automation.postUrl,
      is_active: automation.isActive,
      pending_placeholder: automation.postId?.startsWith('rxdd-pending-') ?? false
    },
    analytics: {
      sent,
      failed,
      clicks: uniqueClicks,
      ctr: calculateCtr(uniqueClicks, sent)
    }
  };
}