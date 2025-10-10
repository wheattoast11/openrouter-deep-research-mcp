import React from 'react';

const ElicitationModal = ({ request, onClose, onSubmit }) => {
  const [data, setData] = React.useState('');

  const handleSubmit = () => {
    onSubmit(request.elicitationId, data);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-terminal-bg border border-terminal-accent rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">{request.prompt}</h2>
        <textarea
          className="w-full h-32 bg-terminal-bg border border-terminal-muted rounded-md p-2"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
        <div className="flex justify-end gap-4 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded bg-terminal-muted">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 rounded bg-terminal-accent">Submit</button>
        </div>
      </div>
    </div>
  );
};

export default ElicitationModal;
