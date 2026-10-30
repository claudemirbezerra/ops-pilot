import { markdownToHtml } from "../lib/markdown";

type Props = {
  text: string;
  className?: string;
};

export function MarkdownBody({ text, className = "md-body" }: Props) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
    />
  );
}
