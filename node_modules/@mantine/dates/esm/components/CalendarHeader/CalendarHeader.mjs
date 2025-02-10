'use client';
import { jsxs, jsx } from 'react/jsx-runtime';
import { createVarsResolver, getSize, getFontSize, factory, useProps, useStyles, Box, UnstyledButton, AccordionChevron } from '@mantine/core';
import classes from './CalendarHeader.module.css.mjs';

const defaultProps = {
  nextDisabled: false,
  previousDisabled: false,
  hasNextLevel: true,
  withNext: true,
  withPrevious: true
};
const varsResolver = createVarsResolver((_, { size }) => ({
  calendarHeader: {
    "--dch-control-size": getSize(size, "dch-control-size"),
    "--dch-fz": getFontSize(size)
  }
}));
const CalendarHeader = factory((_props, ref) => {
  const props = useProps("CalendarHeader", defaultProps, _props);
  const {
    classNames,
    className,
    style,
    styles,
    unstyled,
    vars,
    nextIcon,
    previousIcon,
    nextLabel,
    previousLabel,
    onNext,
    onPrevious,
    onLevelClick,
    label,
    nextDisabled,
    previousDisabled,
    hasNextLevel,
    levelControlAriaLabel,
    withNext,
    withPrevious,
    __staticSelector,
    __preventFocus,
    __stopPropagation,
    ...others
  } = props;
  const getStyles = useStyles({
    name: __staticSelector || "CalendarHeader",
    classes,
    props,
    className,
    style,
    classNames,
    styles,
    unstyled,
    vars,
    varsResolver,
    rootSelector: "calendarHeader"
  });
  const preventFocus = __preventFocus ? (event) => event.preventDefault() : void 0;
  return /* @__PURE__ */ jsxs(Box, { ...getStyles("calendarHeader"), ref, ...others, children: [
    withPrevious && /* @__PURE__ */ jsx(
      UnstyledButton,
      {
        ...getStyles("calendarHeaderControl"),
        "data-direction": "previous",
        "aria-label": previousLabel,
        onClick: onPrevious,
        unstyled,
        onMouseDown: preventFocus,
        disabled: previousDisabled,
        "data-disabled": previousDisabled || void 0,
        tabIndex: __preventFocus || previousDisabled ? -1 : 0,
        "data-mantine-stop-propagation": __stopPropagation || void 0,
        children: previousIcon || /* @__PURE__ */ jsx(
          AccordionChevron,
          {
            ...getStyles("calendarHeaderControlIcon"),
            "data-direction": "previous",
            size: "45%"
          }
        )
      }
    ),
    /* @__PURE__ */ jsx(
      UnstyledButton,
      {
        component: hasNextLevel ? "button" : "div",
        ...getStyles("calendarHeaderLevel"),
        onClick: hasNextLevel ? onLevelClick : void 0,
        unstyled,
        onMouseDown: hasNextLevel ? preventFocus : void 0,
        disabled: !hasNextLevel,
        "data-static": !hasNextLevel || void 0,
        "aria-label": levelControlAriaLabel,
        tabIndex: __preventFocus || !hasNextLevel ? -1 : 0,
        "data-mantine-stop-propagation": __stopPropagation || void 0,
        children: label
      }
    ),
    withNext && /* @__PURE__ */ jsx(
      UnstyledButton,
      {
        ...getStyles("calendarHeaderControl"),
        "data-direction": "next",
        "aria-label": nextLabel,
        onClick: onNext,
        unstyled,
        onMouseDown: preventFocus,
        disabled: nextDisabled,
        "data-disabled": nextDisabled || void 0,
        tabIndex: __preventFocus || nextDisabled ? -1 : 0,
        "data-mantine-stop-propagation": __stopPropagation || void 0,
        children: nextIcon || /* @__PURE__ */ jsx(
          AccordionChevron,
          {
            ...getStyles("calendarHeaderControlIcon"),
            "data-direction": "next",
            size: "45%"
          }
        )
      }
    )
  ] });
});
CalendarHeader.classes = classes;
CalendarHeader.displayName = "@mantine/dates/CalendarHeader";

export { CalendarHeader };
//# sourceMappingURL=CalendarHeader.mjs.map
