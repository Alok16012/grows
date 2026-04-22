const fs = require('fs');
fetch('http://localhost:5173/api/employees/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        rows: [
            {
                firstName: "Test",
                lastName: "User",
                phone: "9876543210",
                email: "testuser@example.com",
                designation: "Guard",
                employmentType: "Full-time",
                basicSalary: 10000,
                city: "Delhi"
            }
        ]
    })
}).then(r => r.json()).then(console.log).catch(console.error);
