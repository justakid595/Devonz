// Updated app/routes/credits.tsx

import React from 'react';

const Credits = () => {
    return (
        <div style={{ padding: '20px', backgroundColor: '#f9f9f9', border: '1px solid #ddd' }}>
            <h1 style={{ color: '#333' }}>Credits</h1>
            <p style={{ fontSize: '16px', lineHeight: '1.5', color: '#666' }}>
                Thank you for using our application!
            </p>
            <ul style={{ listStyleType: 'none', padding: '0' }}>
                <li style={{ marginBottom: '10px' }}>Developer: John Doe</li>
                <li style={{ marginBottom: '10px' }}>Designer: Jane Smith</li>
                <li>Tester: Sam Johnson</li>
            </ul>
        </div>
    );
};

export default Credits;
