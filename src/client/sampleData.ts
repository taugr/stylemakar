import {
  DEFAULT_PROVIDER,
  DEFAULT_STYLE_PROFILE,
  DEFAULT_VOICE_PROFILE,
} from '../shared/defaults';
import type { DocumentRecord } from '../shared/types';

export const sampleOriginal = `Our solution leverages cutting-edge AI technology to optimize workflow efficiency and deliver actionable insights. By harnessing the power of machine learning algorithms and advanced analytics, we empower organizations to make data-driven decisions that accelerate growth and improve productivity across all departments.

We understand the challenges businesses face in today's fast-paced environment. That's why our platform is designed to integrate seamlessly with your existing tools and adapt to your unique needs. From automating repetitive tasks to uncovering hidden opportunities in your data, we help you focus on what matters most.

Our team of experts is committed to your success. We partner with you every step of the way to ensure you achieve measurable results and a strong return on investment.`;

export const sampleRewritten = `We use AI to streamline workflows and deliver insights that matter. By applying machine learning and practical analytics, we help teams make better decisions, drive growth, and get more done across the organization.

Today's business environment moves fast. That's why our platform integrates smoothly with your existing tools and adapts to your unique needs. It automates repetitive work and uncovers opportunities in your data-so you can focus on what drives the most value.

Our team is with you from start to finish. We work alongside you to deliver results you can measure and impact you can see.`;

export const seedDocuments: DocumentRecord[] = [
  {
    createdAt: '2026-05-30T10:24:00.000Z',
    id: 'q2-product-strategy',
    originalText: sampleOriginal,
    provider: DEFAULT_PROVIDER,
    rewrittenText: sampleRewritten,
    styleProfile: DEFAULT_STYLE_PROFILE,
    title: 'Q2 Product Strategy Draft',
    updatedAt: '2026-05-30T10:24:00.000Z',
    voiceProfileId: DEFAULT_VOICE_PROFILE.id,
    warnings: [],
  },
  {
    createdAt: '2026-05-18T09:00:00.000Z',
    id: 'blog-post-may-2025',
    originalText: sampleOriginal,
    provider: DEFAULT_PROVIDER,
    rewrittenText: '',
    styleProfile: DEFAULT_STYLE_PROFILE,
    title: 'Blog Post - May 2025',
    updatedAt: '2026-05-18T09:00:00.000Z',
    voiceProfileId: DEFAULT_VOICE_PROFILE.id,
    warnings: [],
  },
  {
    createdAt: '2026-05-17T09:00:00.000Z',
    id: 'launch-announcement',
    originalText: sampleOriginal,
    provider: DEFAULT_PROVIDER,
    rewrittenText: '',
    styleProfile: DEFAULT_STYLE_PROFILE,
    title: 'Launch Announcement',
    updatedAt: '2026-05-17T09:00:00.000Z',
    voiceProfileId: DEFAULT_VOICE_PROFILE.id,
    warnings: [],
  },
];
