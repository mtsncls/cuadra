export interface CommentMessage {
  id: string;
  author: string;
  authorColor: string;
  body: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  docId: string;
  anchor: string;
  anchorText: string;
  author: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messages: CommentMessage[];
}
