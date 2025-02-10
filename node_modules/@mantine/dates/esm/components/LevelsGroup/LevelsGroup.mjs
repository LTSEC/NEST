'use client';
import { jsx } from 'react/jsx-runtime';
import { factory, useProps, useStyles, Box } from '@mantine/core';
import classes from './LevelsGroup.module.css.mjs';

const defaultProps = {};
const LevelsGroup = factory((_props, ref) => {
  const props = useProps("LevelsGroup", defaultProps, _props);
  const { classNames, className, style, styles, unstyled, vars, __staticSelector, ...others } = props;
  const getStyles = useStyles({
    name: __staticSelector || "LevelsGroup",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    vars,
    rootSelector: "levelsGroup"
  });
  return /* @__PURE__ */ jsx(Box, { ref, ...getStyles("levelsGroup"), ...others });
});
LevelsGroup.classes = classes;
LevelsGroup.displayName = "@mantine/dates/LevelsGroup";

export { LevelsGroup };
//# sourceMappingURL=LevelsGroup.mjs.map
