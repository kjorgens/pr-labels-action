# pr-labels-action
add or remove labels.

## Inputs
### github-token
github token.

### pr-number
optional, pull request number.

### comment-trigger-add
comment string that triggers label creation/add.

### comment-trigger-remove
comment string that triggers label remove.

### comment-trigger-remove-all
comment string to trigger remove all labels on pull request.

### label-name
label name for creation/removal.

### label-color
optional, color code for new label without leading #.

### label-description
optional, description for new label

## Example usage
```
name: add/remove label on comment

on:
  issue_comment:
    types: [created]

jobs:
  label-the-pr:
    runs-on: ubuntu-latest
    name: labeling action
    steps:
      - name: Checkout
        uses: actions/checkout@v2
      - name: set up for labels
        uses: kjorgens/pr-labels-action@main
        with:
          label-name: Label Action        
```

## Accepted comment structure
Add a label to the pull request.
```
add lable
```

Remove labels to remove the label named by label-name or the labels (comma seperated) specified in the comment
```
remove labels
remove labels mergeit, approved
```

Remove all labels on the pull request
```
remove all labels
```

