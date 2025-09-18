/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import { useState } from 'react';
import ReactDOM from 'react-dom/client';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Define the response schema for Gemini
const schema = {
  type: Type.OBJECT,
  properties: {
    subnets: {
      type: Type.ARRAY,
      description: 'The calculated subnets.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Name of the subnet.',
          },
          requiredHosts: {
            type: Type.INTEGER,
            description: 'Number of hosts required for the subnet.',
          },
          allocatedHosts: {
            type: Type.INTEGER,
            description: 'Number of hosts allocated to the subnet.',
          },
          networkAddress: {
            type: Type.STRING,
            description: 'The network address for this subnet.',
          },
          usableRange: {
            type: Type.STRING,
            description: 'The range of usable IP addresses.',
          },
          broadcastAddress: {
            type: Type.STRING,
            description: 'The broadcast address for this subnet.',
          },
          subnetMask: {
            type: Type.STRING,
            description: 'The subnet mask in decimal format.',
          },
          cidr: {
            type: Type.STRING,
            description: 'CIDR notation for the subnet.',
          },
        },
      },
    },
    error: {
      type: Type.STRING,
      description:
        'An error message if calculation is not possible (e.g., not enough IP addresses). If the calculation is successful, this field should be omitted.',
    },
  },
};

// Define types for our state
type SubnetRequest = {
  id: number;
  name: string;
  hosts: number;
};

type SubnetResult = {
  name: string;
  requiredHosts: number;
  allocatedHosts: number;
  networkAddress: string;
  usableRange: string;
  broadcastAddress: string;
  subnetMask: string;
  cidr: string;
};

function App() {
  const [majorNetwork, setMajorNetwork] = useState('192.168.10.0');
  const [cidr, setCidr] = useState(24);
  const [subnets, setSubnets] = useState<SubnetRequest[]>([
    { id: 1, name: 'HR', hosts: 50 },
    { id: 2, name: 'Sales', hosts: 25 },
    { id: 3, name: 'IT', hosts: 10 },
  ]);
  const [results, setResults] = useState<SubnetResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSubnet = () => {
    setSubnets([
      ...subnets,
      { id: Date.now(), name: '', hosts: 0 },
    ]);
  };

  const removeSubnet = (id: number) => {
    setSubnets(subnets.filter((subnet) => subnet.id !== id));
  };

  const updateSubnet = (id: number, field: 'name' | 'hosts', value: string | number) => {
    setSubnets(
      subnets.map((subnet) =>
        subnet.id === id ? { ...subnet, [field]: value } : subnet
      )
    );
  };

  const handleCalculate = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    const subnetRequests = subnets
      .filter((s) => s.name && s.hosts > 0)
      .map((s) => `- ${s.name}: ${s.hosts} hosts`)
      .join('\n');

    const prompt = `
      You are a network administrator expert.
      Perform a Variable Length Subnet Mask (VLSM) calculation for the major network ${majorNetwork}/${cidr}.
      Create subnets for the following departments with their required number of hosts:
      ${subnetRequests}
      
      Sort the subnets in descending order of required hosts before calculating.
      If the total required hosts exceed the capacity of the major network, return an error message.
      Provide the following details for each calculated subnet:
      - Name
      - Required Hosts
      - Allocated Hosts (the actual size of the subnet, e.g., for 50 required hosts, you'd allocate a /26 which has 62 usable hosts)
      - Network Address
      - Usable Host Range
      - Broadcast Address
      - Subnet Mask
      - CIDR notation
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      // Sanitize the response, as Gemini may wrap it in markdown.
      let jsonString = response.text.trim();
      const jsonMatch = jsonString.match(/^```json\n([\s\S]*?)\n```$/);
      if (jsonMatch && jsonMatch[1]) {
        jsonString = jsonMatch[1];
      }
      
      const data = JSON.parse(jsonString);

      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.subnets);
      }
    } catch (e) {
      console.error(e);
      setError('An unexpected error occurred while communicating with the API.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h1>VLSM Calculator with Gemini</h1>

      <div className="card">
        <h2>Major Network</h2>
        <div className="form-group">
          <label htmlFor="majorNetwork">Network Address / CIDR</label>
          <div className="input-group">
            <input
              type="text"
              id="majorNetwork"
              value={majorNetwork}
              onChange={(e) => setMajorNetwork(e.target.value)}
              aria-label="Major network address"
            />
            <span>/</span>
            <input
              type="number"
              id="cidr"
              value={cidr}
              onChange={(e) => setCidr(parseInt(e.target.value, 10))}
              min="1"
              max="32"
              aria-label="CIDR prefix"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Subnets</h2>
        {subnets.map((subnet, index) => (
          <div key={subnet.id} className="subnet-row">
            <input
              type="text"
              placeholder={`Subnet #${index + 1} Name`}
              value={subnet.name}
              onChange={(e) => updateSubnet(subnet.id, 'name', e.target.value)}
              aria-label="Subnet name"
            />
            <input
              type="number"
              placeholder="Required Hosts"
              value={subnet.hosts}
              onChange={(e) =>
                updateSubnet(subnet.id, 'hosts', parseInt(e.target.value, 10))
              }
              aria-label="Required hosts"
              min="0"
            />
            <button
              onClick={() => removeSubnet(subnet.id)}
              className="btn-danger"
              aria-label={`Remove subnet ${subnet.name || index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button onClick={addSubnet} className="btn-secondary">
          Add Subnet
        </button>
      </div>

      <button onClick={handleCalculate} disabled={isLoading} className="btn-primary">
        {isLoading ? 'Calculating...' : 'Calculate'}
      </button>

      <div className="results">
        {isLoading && (
          <div className="loading">
            <div className="loader"></div>
            <p>Gemini is performing the calculations...</p>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {results && (
          <div className="card">
            <h2>Results</h2>
            <table className="results-table" aria-live="polite">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Required Hosts</th>
                  <th>Allocated Hosts</th>
                  <th>Network Address</th>
                  <th>Usable Range</th>
                  <th>Broadcast</th>
                  <th>Mask</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => (
                  <tr key={res.networkAddress}>
                    <td>{res.name}</td>
                    <td>{res.requiredHosts}</td>
                    <td>{res.allocatedHosts}</td>
                    <td>{res.networkAddress}{res.cidr}</td>
                    <td>{res.usableRange}</td>
                    <td>{res.broadcastAddress}</td>
                    <td>{res.subnetMask}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);