const http = require('http');
const app = require('./server');

const server = app.listen(4568, async () => {
  console.log('Test server running on port 4568');

  function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: 'localhost',
        port: 4568,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    const timestamp = Date.now();
    // 1. Test registration of a brand new citizen
    console.log('Testing brand new citizen registration...');
    const regRes = await request('POST', '/api/auth/register', {
      name: `Rohan Verma ${timestamp}`,
      email: `rohan.${timestamp}@example.com`,
      phone: '+91 99999 88888'
    });
    console.log('Registration status:', regRes.status);
    console.log('New citizen complaint count (must be 0):', regRes.body.user.complaintCount);
    if (regRes.body.user.complaintCount !== 0) {
      throw new Error(`Expected complaintCount to be 0 for new citizen, got ${regRes.body.user.complaintCount}`);
    }
    const rohanId = regRes.body.user.id;

    // 2. Verify My Map for new citizen returns 0 complaints
    console.log('Testing My Map for new citizen (must return 0 complaints)...');
    const mapRes1 = await request('GET', `/api/hotspots/map-data?userId=${rohanId}&role=citizen`);
    console.log('New citizen map points count:', mapRes1.body.data.length);
    if (mapRes1.body.data.length !== 0) {
      throw new Error(`Expected 0 map points for new user, got ${mapRes1.body.data.length}`);
    }

    // 3. Submit first complaint for this new citizen
    console.log('Testing first complaint submission for new citizen...');
    const submitRes = await request('POST', '/api/complaints', {
      userId: rohanId,
      issueType: 'Pothole',
      severity: 'HIGH',
      department: 'Roads & Bridges',
      locationId: 1,
      description: 'Deep road cavity outside metro station entrance.',
      citizenName: `Rohan Verma ${timestamp}`,
      imageUrl: '/assets/sample-pothole.jpg',
      isAiAssisted: true,
      aiConfidence: 94.2
    });
    console.log('Submission status:', submitRes.status);
    console.log('Complaint Ticket:', submitRes.body.complaintNumber);
    console.log('AI Priority:', submitRes.body.priority.priorityLevel, 'Score:', submitRes.body.priority.priorityScore);
    console.log('Updated user complaint count (must be 1):', submitRes.body.userComplaintCount);
    if (submitRes.body.userComplaintCount !== 1) {
      throw new Error(`Expected 1 complaint after submission, got ${submitRes.body.userComplaintCount}`);
    }

    // 4. Verify My Map now has 1 complaint
    console.log('Testing My Map after 1 complaint (must return 1)...');
    const mapRes2 = await request('GET', `/api/hotspots/map-data?userId=${rohanId}&role=citizen`);
    console.log('New citizen map points count now:', mapRes2.body.data.length);
    if (mapRes2.body.data.length !== 1) {
      throw new Error(`Expected 1 map point for user, got ${mapRes2.body.data.length}`);
    }
    if (mapRes2.body.data[0].userId !== rohanId) {
      throw new Error(`Expected point to belong to user ${rohanId}, got ${mapRes2.body.data[0].userId}`);
    }

    // 5. Submit second complaint for this new citizen
    console.log('Testing second complaint submission for new citizen...');
    const submitRes2 = await request('POST', '/api/complaints', {
      userId: rohanId,
      issueType: 'Broken streetlight',
      severity: 'HIGH',
      department: 'Electrical & Lighting',
      locationId: 2,
      description: 'Streetlight unlit near market bus stop.',
      citizenName: `Rohan Verma ${timestamp}`,
      imageUrl: '/assets/sample-streetlight.jpg',
      isAiAssisted: true,
      aiConfidence: 96.0
    });
    console.log('Updated user complaint count (must be 2):', submitRes2.body.userComplaintCount);
    if (submitRes2.body.userComplaintCount !== 2) {
      throw new Error(`Expected 2 complaints after submission, got ${submitRes2.body.userComplaintCount}`);
    }

    // 6. Verify My Map now has 2 complaints
    console.log('Testing My Map after 2 complaints (must return 2)...');
    const mapRes3 = await request('GET', `/api/hotspots/map-data?userId=${rohanId}&role=citizen`);
    console.log('New citizen map points count now:', mapRes3.body.data.length);
    if (mapRes3.body.data.length !== 2) {
      throw new Error(`Expected 2 map points for user, got ${mapRes3.body.data.length}`);
    }

    // 7. Verify existing citizen (Public Citizen, id 4) does NOT see Rohan's complaints
    console.log('Testing citizen privacy & isolation...');
    const citizenMap = await request('GET', '/api/hotspots/map-data?userId=4&role=citizen');
    const rohanInCitizenMap = citizenMap.body.data.find(c => c.userId === rohanId);
    if (rohanInCitizenMap) {
      throw new Error('Leak detected! Public Citizen saw Rohan\'s complaint');
    }
    console.log(`Public Citizen sees ${citizenMap.body.data.length} complaints, none of which belong to Rohan. Verified!`);

    console.log('ALL WORKFLOW AND ISOLATION TESTS PASSED SUCCESSFULLY! ✅');
  } catch (err) {
    console.error('TEST FAILED ❌:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
