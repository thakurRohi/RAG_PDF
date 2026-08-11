'use client';

import * as React from 'react';
import LibraryPanel from './components/file-upload';
import ChatComponent from './components/chat';
import type { DocumentSummary } from '@/lib/api';

export default function Home() {
  const [documents, setDocuments] = React.useState<DocumentSummary[]>([]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="w-[320px] shrink-0">
        <LibraryPanel documents={documents} onDocumentsChange={setDocuments} />
      </div>
      <ChatComponent hasDocuments={documents.length > 0} documentCount={documents.length} />
    </div>
  );
}
