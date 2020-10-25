import axios from "axios";
import { parseArgitRemoteURI } from "./arweave.js";

const graphQlEndpoint = "https://arweave.net/graphql";

export const getOidByRef = async (arweave, remoteURI, ref) => {
  const { repoOwnerAddress, repoName } = parseArgitRemoteURI(remoteURI);
  const { data } = await axios({
    url: graphQlEndpoint,
    method: "post",
    data: {
      query: `
      query {
        transactions(
          owners: ["${repoOwnerAddress}"]
          tags: [
            { name: "Repo", values: ["${repoName}"] }
            { name: "ref", values: ["${ref}"] }
            { name: "Type", values: ["update-ref"] }
            { name: "App-Name", values: ["dgit"] }
          ]
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }`,
    },
  });

  const edges = data.data.transactions.edges;

  if (edges.length === 0) {
    return "0000000000000000000000000000000000000000";
  }

  const id = edges[0].node.id;
  return await arweave.transactions.getData(id, {
    decode: true,
    string: true,
  });
};

export const getAllRefs = async (arweave, remoteURI) => {
  let refs = new Set();
  let refOidObj = {};
  const { repoOwnerAddress, repoName } = parseArgitRemoteURI(remoteURI);
  const { data } = await axios({
    url: graphQlEndpoint,
    method: "post",
    data: {
      query: `
      query {
        transactions(
          owners: ["${repoOwnerAddress}"]
          tags: [
            { name: "Repo", values: ["${repoName}"] }
            { name: "Type", values: ["update-ref"] }
            { name: "App-Name", values: ["dgit"] }
          ]
        ) {
          edges {
            node {
              tags {
                name
                value
              }
            }
          }
        }
      }`,
    },
  });

  const edges = data.data.transactions.edges;

  for (const edge of edges) {
    for (const tag of edge.node.tags) {
      if (tag.name === "ref") {
        refs.add(tag.value);
      }
    }
  }

  for (const ref of refs) {
    refOidObj[ref] = await getOidByRef(arweave, remoteURI, ref);
  }

  return refOidObj;
};

export const getTransactionIdByObjectId = async (remoteURI, oid) => {
  const { repoOwnerAddress, repoName } = parseArgitRemoteURI(remoteURI);
  const { data } = await axios({
    url: graphQlEndpoint,
    method: "post",
    data: {
      query: `
      query {
        transactions(
          owners: ["${repoOwnerAddress}"]
          tags: [
            { name: "oid", values: ["${oid}"] }
            { name: "Repo", values: ["${repoName}"] }
            { name: "Type", values: ["push-git-object"] }
            { name: "App-Name", values: ["dgit"] }
          ]
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }`,
    },
  });

  const edges = data.data.transactions.edges;
  return edges[0].node.id;
};

export const fetchGitObjects = async (arweave, arData, remoteURI) => {
  const objects = [];
  const { repoOwnerAddress, repoName } = parseArgitRemoteURI(remoteURI);
  const { data } = await axios({
    url: graphQlEndpoint,
    method: "post",
    data: {
      query: `
      query {
        transactions(
          owners: ["${repoOwnerAddress}"]
          tags: [
            { name: "Type", values: ["git-objects-bundle"] }
            { name: "Repo", values: ["${repoName}"] }
            { name: "App-Name", values: ["dgit"] }
          ]
        ) {
          edges {
            node {
              id
            }
          }
        }
      }`,
    },
  });

  const edges = data.data.transactions.edges;
  await Promise.all(
    edges.map(async (edge) => {
      const txid = edge.node.id;
      const txData = await arweave.transactions.getData(txid, {
        decode: true,
        string: true,
      });
      const items = await arData.unbundleData(txData);
      await Promise.all(
        items.map(async (item) => {
          const data = await arData.decodeData(item, { string: false });
          for (let i = 0; i < item.tags.length; i++) {
            const tag = await arData.decodeTag(item.tags[i]);
            if (tag.name === "oid") {
              const oid = tag.value;
              objects.push({ oid, data });
              break;
            }
          }
        })
      );
    })
  );

  return objects;
};
