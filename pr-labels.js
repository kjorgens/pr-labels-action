// import * as core from '@actions/core';
const core = require('@actions/core');
// import github from '@actions/github';
const github = require('@actions/github');
// const { getOctokit } = github;
// import { graphql } from '@octokit/graphql';
const ghpkg = require('@octokit/graphql');
const { graphql } = ghpkg;

// const octokit = github.getOctokit(process.env.GH_TOKEN || core.getInput('github-token'));

const getPRIdQuery = `query($repo: String!, $prNumber: Int!, $owner: String!) {
  repository(owner: $owner, name: $repo) {
    name
    pullRequest(number: $prNumber) {
      id
    }
  }
}`;

const getRepoIdQuery = `query($repo: String!, $owner: String!) {
  repository(owner: $owner, name: $repo) {
    name
    id
  }
}`;

const createCommentMutation = `mutation($prId: ID!, $commentBody: String!) {
  addComment(input:{subjectId: $prId, body: $commentBody}) {
    commentEdge {
      node {
        createdAt
        body
      } 
    }
    subject {
      id
    }
  }
}`;

const createLabelMutation = `mutation($color: String!, $name: String!, $description: String!, $repositoryId: ID!) {
  createLabel(input:{color: $color, name: $name, description: $description, repositoryId: $repositoryId}) {
    label {
       name
       id
    }   
  }
}`;

const addLabelsMutation = `mutation($labelIds: [ID!]!, $labelableId: ID!) {
  addLabelsToLabelable(input:{labelIds: $labelIds, labelableId: $labelableId}) {
     labelable {
      labels(first: 50) {
        nodes {
          name
        }
      }
    }
  }
}`;

const removeLabelsMutation = `mutation($labelIds: [ID!]!, $labelableId: ID!) {
  removeLabelsFromLabelable(input:{labelIds: $labelIds, labelableId: $labelableId}) {
     labelable {
      labels(first: 50) {
        nodes {
          name
        }
      }
    }
  }
}`;

const removeAllLabelsMutation = `mutation($labelableId: ID!) {
  clearLabelsFromLabelable(input:{labelableId: $labelableId}) {
     labelable {
      labels(first: 50) {
        nodes {
          name
        }
      }
    }
  }
}`;

const getRepoLabels = `query($repoId: ID!) { 
  node(id: $repoId) {
    ... on Repository {
      labels(first: 50) {
        totalCount
        nodes {
          name
          id
        }
      }
    }
  }
}`;

async function addLabels(prId, labelId) {
  return await graphql(addLabelsMutation, {
    labelableId: prId,
    labelIds: labelId,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
      accept: 'application/vnd.github.bane-preview+json'
    }
  });
}

async function removeAllLabelsFromPr(repoOwner, repo, prNumber) {
  const prId = await findPrId(repoOwner, repo, prNumber);
  return await graphql(removeAllLabelsMutation, {
    labelableId: prId,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
      accept: 'application/vnd.github.bane-preview+json'
    }
  });
}

async function removeLabelsFromPr(prId, labelIds) {
  return await graphql(removeLabelsMutation, {
    labelableId: prId,
    labelIds: labelIds,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
      accept: 'application/vnd.github.bane-preview+json'
    }
  });
}

async function addLabelToTable(owner, repoId, labelName, color, labelDescription) {
  try {
    return await graphql(createLabelMutation, {
      color: color || 'FBCA04',
      description: labelDescription || '',
      name: labelName,
      repositoryId: repoId,
      headers: {
        authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
        accept: 'application/vnd.github.bane-preview+json'
      }
    });
  } catch(err) {
    console.log(err);
  }

}
async function findPrId(owner, repo, prNumber) {
  const pullRequest = await graphql(getPRIdQuery, {
    repo: repo,
    owner: owner,
    prNumber: prNumber,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
    }
  });

  return pullRequest.repository.pullRequest.id;
}

async function findRepoId(owner, repo) {
  const repoIdInfo = await graphql(getRepoIdQuery, {
    owner: owner,
    repo: repo,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`
    }
  });

  return (repoIdInfo.repository.id);
}

async function findLabelId(owner, repoId, labelName) {
  const labels = await graphql(getRepoLabels, {
    repoId: repoId,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`,
      accept: 'application/vnd.github.bane-preview+json'
    }
  });

  const labelFound = labels.node.labels.nodes.find((label) => {
    return label.name === labelName;
  });

  console.log(labelFound);
  if (labelFound) {
    return labelFound.id;
  }
  throw new Error(`label ${labelName} not found`);
}

async function createPrLabel(owner, repo, prNumber, labelName, labelColor, labelDescription) {
  let labelId;
  let repoId;
  let prId;
  try {
    repoId = await findRepoId(owner, repo);
    prId = await findPrId(owner, repo, prNumber);
  } catch(err) {
    core.setFailed(`failure creating label = ${err.message}`);
    process.exit(1);
  }
  try {
    labelId = await findLabelId(owner, repoId, labelName);
  } catch (err) {
    if (err.message === 'label not found') {
      console.log(`adding ${labelName} to ${repo}`);
      const results =  await addLabelToTable(owner, repoId, labelName, labelColor, labelDescription);
      labelId = results.createLabel.label.id;
    }
  }

  try {
    const labels = await addLabels(prId, labelId);
  } catch (err) {
    core.setFailed(`failure creating label = ${err.message}`);
    process.exit(1);
  }
  console.log(`label ${labelName} added to ${prNumber}`);
  process.exit(0);
}

async function removePrLabels(owner, repo, prNumber, labelNames) {
  let repoId;
  let prId;
  try {
    repoId = await findRepoId(owner, repo);
    prId = await findPrId(owner, repo, prNumber);
  } catch(err) {
    core.setFailed(`failure finding pull request ${prNumber}: ${err.message}`);
    process.exit(1);
  }

  const labelIds = await Promise.all(labelNames.map(async (label) => {
    try {
      return await findLabelId(owner, repoId, label.trim());
    } catch (err) {
      if (err.message === 'label not found') {
        console.log(`label ${label} does not exist on PR number ${prNumber}`);
      }
      return null;
    }
  }));

  const validIds = labelIds.filter((id) => {
    return id;
  });

  try {
    const labels = await removeLabelsFromPr(prId, validIds);
  } catch (err) {
    core.setFailed(`failure removing label = ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

async function createPrComment(owner, repo, prNum, commentBodyText) {
  const prId = await findPrId(owner, repo, prNum);

  return await graphql(createCommentMutation, {
    prId: prId,
    commentBody: commentBodyText,
    owner: owner,
    repo: repo,
    headers: {
      authorization: `token ${process.env.GH_TOKEN || core.getInput('github-token')}`
    }
  });
}

(async () => {
  // try {
  //   let labelName = 'short test';
  //   const commentString = 'remove labels automated pr, Label Action, missing';
  //   const reg = new RegExp('remove labels', 'gi');
  //   if (commentString.match(reg)) {
  //     if (commentString.length > 'remove labels'.length + 2) {
  //       labelName = commentString.slice('remove labels'.length + 1);
  //       multiLabel = labelName.split(',');
  //       await removePrLabels('vivintsolar', 'github-actions-testing', 71, multiLabel);
  //
  //       console.log('done');
  //     }
  //
  //     // await createPrLabel('vivintsolar', 'github-actions-testing', 71, labelName, 'B8f345', 'decsription');
  //     // await removeAllPrLabels('vivintsolar', 'github-actions-testing', 71, labelName, 'B8f345', 'decsription');
  //
  //     // await removeAllLabelsFromPr('vivintsolar', 'github-actions-testing', 71);
  //   }
  // } catch (error) {
  //   core.setFailed(error.message);
  //   process.exit(1);
  // }
  try {
    // const payload = JSON.stringify(github.context.payload, undefined, 2);
    // console.log(payload);

    let repoName;
    let prNumber;
    let repoOwner;
    let labelName;
    let labelColor;
    let labelDescription;
    let commentAddString;
    let commentRemoveString;

    if (github.context.payload.action === 'created' && github.context.payload.comment !== undefined) {
      commentString = github.context.payload.comment.body;
      repoName = github.context.payload.repository.name;
      prNumber = github.context.payload.issue.number;
      repoOwner = github.context.payload.organization.login;
      labelName = core.getInput('label-name');
      labelColor = core.getInput('label-color') || 'FBCA04';
      labelDescription = core.getInput('label-description') || '';
      commentAddString = core.getInput('comment-trigger-add') || 'add labels';
      commentRemoveString = core.getInput('comment-trigger-remove') || 'remove labels';
      commentRemoveAllString = core.getInput('comment-trigger-remove-all') || 'remove all labels';

      if (commentString.match(new RegExp(commentAddString, 'gi'))) {
        if (commentString.length > commentAddString.length + 2) {
          labelName = commentString.slice(commentAddString.length + 1);
        }
        await createPrLabel(repoOwner, repoName, prNumber, labelName.trim(), labelColor, labelDescription);
      }
      if (commentString.match(new RegExp(commentRemoveString, 'gi'))) {
        if (commentString.length > commentRemoveString.length + 2) {
          labelName = commentString.slice(commentRemoveString.length + 1);
          labelNames = labelName.split(',');
        } else {
          labelNames =  labelName;
        }
        await removePrLabels(repoOwner, repoName, prNumber, labelNames);
      }
      if (commentString.match(new RegExp(commentRemoveAllString, 'gi'))) {
        await removeAllLabelsFromPr(repoOwner, repoName, prNumber);
      }
    }
  } catch (error) {
    core.setFailed(error.message);
    process.exit(1);
  }
})();
