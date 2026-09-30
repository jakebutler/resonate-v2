type ReviewedPost = {
  title: string; content: string; linkedinFirstComment?: string;
  blogExcerpt?: string; blogAuthor?: string; blogCategory?: string; blogTags?: string[]; blogSlug?: string;
  heroImageUrl?: string; heroImageStorageId?: string;
};
export const approvalArticleSignature = (post: ReviewedPost) => JSON.stringify({ title: post.title, content: post.content, linkedinFirstComment: post.linkedinFirstComment ?? "" });
export const publicationMetadataSignature = (post: ReviewedPost) => JSON.stringify({ excerpt: post.blogExcerpt ?? "", author: post.blogAuthor ?? "", category: post.blogCategory ?? "", tags: post.blogTags ?? [], slug: post.blogSlug ?? "", heroUrl: post.heroImageUrl ?? "", heroStorageId: post.heroImageStorageId ?? "" });
